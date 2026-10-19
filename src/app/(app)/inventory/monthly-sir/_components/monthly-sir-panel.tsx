"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingModal } from "@/components/ui/loading-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMonthlySirUploadAction,
  buildMonthlySirTemplateFromScansAction,
  createMonthlySirRequestAction,
  downloadMonthlySirTemplateAction,
  generateMonthlySirVarianceAction,
  getPcountUploadAllowanceAction,
  previewMonthlySirUploadAction,
  reviewMonthlySirRequestAction,
  validateMonthlySirScansAction,
} from "@/features/monthly-sir/actions/monthly-sir.actions";
import {
  MONTHLY_SIR_STATUS_LABELS,
  MONTHLY_SIR_STATUS_VARIANTS,
} from "@/features/monthly-sir/constants/monthly-sir";
import type { PcountUploadAllowance } from "@/features/monthly-sir/lib/pcount-upload-allowance";
import { cn } from "@/utils/cn";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function allowanceBadgeLabel(allowance: PcountUploadAllowance): string {
  if (allowance.role === "ps") {
    return allowance.canDirectUpload ? "Upload open today" : "Upload closed today";
  }
  if ((allowance.slotsRemainingToday ?? 0) > 0) {
    return `${allowance.slotsRemainingToday} of ${allowance.slotsTotalMonth} free left`;
  }
  return "0 free · request needed";
}

interface MonthlySirRow {
  id: string;
  purpose: string;
  status: keyof typeof MONTHLY_SIR_STATUS_LABELS;
  reviewRemarks: string | null;
  createdAt: Date;
  uploadedAt: Date | null;
  branch: { id: string; name: string; sapCode: string };
  requestedBy: { name: string | null; email: string };
  stockCountSession: {
    id: string;
    sessionNo: string;
    status: string;
  } | null;
}

interface PaginatedRequests {
  items: MonthlySirRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface MonthlySirPanelProps {
  requests: PaginatedRequests;
  branches: { id: string; name: string; sapCode: string }[];
  tab: "all" | "approval";
  branchId: string;
  canManage: boolean;
  initialAllowance?: PcountUploadAllowance | null;
  initialAllowanceBranchId?: string;
}

interface UploadPreview {
  rowCount: number;
  counts: { status: string; count: number }[];
  invalidSerials: string[];
  invalidStatuses: string[];
}

type DownloadKind = "template" | "scans-excel" | "variance" | null;
type ScanStatus = "validating" | "valid" | "invalid" | "duplicate";

interface ScannedSerial {
  id: number;
  serialNo: string;
  status: ScanStatus;
}

function downloadWorkbook(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MonthlySirPanel({
  requests,
  branches,
  tab,
  branchId,
  canManage,
  initialAllowance = null,
  initialAllowanceBranchId = "",
}: MonthlySirPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => branchId || branches[0]?.id || "",
  );
  const [purpose, setPurpose] = useState("");
  const [allowance, setAllowance] = useState<PcountUploadAllowance | null>(
    () => initialAllowance,
  );
  const [allowanceBranchId, setAllowanceBranchId] = useState(
    () => initialAllowanceBranchId,
  );
  const [reviewRow, setReviewRow] = useState<MonthlySirRow | null>(null);
  const [remarks, setRemarks] = useState("");
  const [uploadRow, setUploadRow] = useState<MonthlySirRow | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [downloadKind, setDownloadKind] = useState<DownloadKind>(null);
  const [scanRow, setScanRow] = useState<MonthlySirRow | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scans, setScans] = useState<ScannedSerial[]>([]);
  const nextScanId = useRef(1);
  const allowanceForBranch =
    selectedBranchId && allowanceBranchId === selectedBranchId
      ? allowance
      : null;
  const allowanceLoading = Boolean(
    selectedBranchId && allowanceBranchId !== selectedBranchId,
  );
  const canDirectUpload = allowanceForBranch?.canDirectUpload ?? false;
  const startMode = canDirectUpload ? "direct" : "request";
  const psUploadClosed =
    allowanceForBranch?.role === "ps" && !allowanceForBranch.canDirectUpload;

  useEffect(() => {
    if (!selectedBranchId || allowanceBranchId === selectedBranchId) return;

    const branchIdForLoad = selectedBranchId;
    let cancelled = false;
    void getPcountUploadAllowanceAction({ branchId: branchIdForLoad }).then(
      (result) => {
        if (cancelled) return;
        if ("error" in result) {
          setAllowance(null);
          setAllowanceBranchId(branchIdForLoad);
          return;
        }
        setAllowance(result.allowance);
        setAllowanceBranchId(branchIdForLoad);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedBranchId, allowanceBranchId]);

  function href(next: {
    tab?: "all" | "approval";
    branch?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    const nextBranch = next.branch === undefined ? branchId : next.branch;
    if (nextTab === "approval") params.set("tab", "approval");
    if (nextBranch) params.set("branch", nextBranch);
    if ((next.page ?? 1) > 1) params.set("page", String(next.page));
    const query = params.toString();
    return query ? `/inventory/monthly-sir?${query}` : "/inventory/monthly-sir";
  }

  function submitStart() {
    startTransition(async () => {
      const result = await createMonthlySirRequestAction({
        branchId: selectedBranchId,
        purpose,
        mode: startMode,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        startMode === "direct"
          ? "P-COUNT upload started — scan or upload when ready"
          : "Monthly SIR request submitted",
      );
      setPurpose("");
      setRequestOpen(false);
      // Refresh allowance after free Start (slot consumed immediately).
      if (selectedBranchId) {
        const next = await getPcountUploadAllowanceAction({
          branchId: selectedBranchId,
        });
        if (!("error" in next)) {
          setAllowance(next.allowance);
          setAllowanceBranchId(selectedBranchId);
        }
      }
      router.refresh();
    });
  }

  function review(decision: "approve" | "reject") {
    if (!reviewRow) return;
    startTransition(async () => {
      const result = await reviewMonthlySirRequestAction({
        requestId: reviewRow.id,
        decision,
        remarks,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(decision === "approve" ? "Request approved" : "Request disapproved");
      setReviewRow(null);
      setRemarks("");
      router.refresh();
    });
  }

  async function downloadTemplate(row: MonthlySirRow) {
    setDownloadKind("template");
    try {
      const result = await downloadMonthlySirTemplateAction(row.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      downloadWorkbook(result.base64, result.filename);
    } catch {
      toast.error("Failed to prepare the P-COUNT template");
    } finally {
      setDownloadKind(null);
    }
  }

  async function generateVariance(row: MonthlySirRow) {
    setDownloadKind("variance");
    try {
      const result = await generateMonthlySirVarianceAction(row.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      downloadWorkbook(result.base64, result.filename);
    } catch {
      toast.error("Failed to prepare the variance workbook");
    } finally {
      setDownloadKind(null);
    }
  }

  async function addScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scanRow) return;
    const serialNo = scanInput.trim();
    if (!serialNo) return;
    setScanInput("");

    const duplicate = scans.some(
      (scan) => scan.serialNo.toUpperCase() === serialNo.toUpperCase(),
    );
    const id = nextScanId.current;
    nextScanId.current += 1;
    setScans((current) => [
      ...current,
      { id, serialNo, status: duplicate ? "duplicate" : "validating" },
    ]);
    if (duplicate) return;

    let result;
    try {
      result = await validateMonthlySirScansAction({
        requestId: scanRow.id,
        serialNos: [serialNo],
      });
    } catch {
      toast.error("Failed to validate the scanned serial");
      setScans((current) =>
        current.map((scan) =>
          scan.id === id ? { ...scan, status: "invalid" } : scan,
        ),
      );
      return;
    }
    if ("error" in result) {
      toast.error(result.error);
      setScans((current) =>
        current.map((scan) =>
          scan.id === id ? { ...scan, status: "invalid" } : scan,
        ),
      );
      return;
    }
    const validated = result.results[0];
    setScans((current) =>
      current.map((scan) =>
        scan.id === id
          ? {
              ...scan,
              serialNo: validated?.serialNo ?? scan.serialNo,
              status: validated?.valid ? "valid" : "invalid",
            }
          : scan,
      ),
    );
  }

  async function buildExcelFromScans() {
    if (!scanRow) return;
    const serialNos = scans
      .filter((scan) => scan.status !== "duplicate")
      .map((scan) => scan.serialNo);
    if (serialNos.length === 0) {
      toast.error("Scan at least one serial number");
      return;
    }
    setDownloadKind("scans-excel");
    try {
      const result = await buildMonthlySirTemplateFromScansAction({
        requestId: scanRow.id,
        serialNos,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      downloadWorkbook(result.base64, result.filename);
      toast.success("Filled P-COUNT Excel is ready. Upload it when reviewed.");
    } catch {
      toast.error("Failed to build the P-COUNT Excel file");
    } finally {
      setDownloadKind(null);
    }
  }

  function previewUpload() {
    if (!uploadRow || !uploadFile) return toast.error("Select an Excel file");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", uploadRow.id);
      formData.set("file", uploadFile);
      const result = await previewMonthlySirUploadAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setPreview(result);
    });
  }

  function applyUpload() {
    if (!uploadRow || !uploadFile || !preview) return;
    if (preview.invalidSerials.length || preview.invalidStatuses.length) {
      toast.error("Resolve invalid rows before uploading");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", uploadRow.id);
      formData.set("file", uploadFile);
      const result = await applyMonthlySirUploadAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Applied ${result.rowCount} P-COUNT rows and generated variances`);
      setUploadRow(null);
      setUploadFile(null);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Scan serials, build the filled Excel file, upload it for validation, then
        generate the variance report.
      </p>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={tab}
            onValueChange={(value) => {
              const next = value === "approval" ? "approval" : "all";
              if (next === tab) return;
              startTransition(() => {
                router.push(href({ tab: next, page: 1 }));
              });
            }}
            className="w-fit"
          >
            <TabsList className="gap-2">
              <TabsTrigger value="all">ALL</TabsTrigger>
              <TabsTrigger value="approval">FOR APPROVAL</TabsTrigger>
            </TabsList>
          </Tabs>
          <SearchableSelect
            className="w-55"
            options={[
              { id: "", label: "All branches" },
              ...branches.map((branch) => ({
                id: branch.id,
                label: `${branch.name} (${branch.sapCode})`,
              })),
            ]}
            value={branchId}
            onChange={(value) => {
              if (value) setSelectedBranchId(value);
              router.push(href({ branch: value, page: 1 }));
            }}
            placeholder="All branches"
            searchPlaceholder="Search branches…"
            emptyMessage="No branches found."
          />
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {allowanceForBranch &&
            !allowanceForBranch.unlimited &&
            (allowanceForBranch.role === "tl" ||
              allowanceForBranch.role === "ps") ? (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {allowanceBadgeLabel(allowanceForBranch)}
              </Badge>
            ) : null}
            <Button
              disabled={!selectedBranchId || allowanceLoading}
              onClick={() => setRequestOpen(true)}
            >
              {canDirectUpload ? "Upload P-COUNT" : "Request to upload P-COUNT"}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableIndexHead />
              <TableHead>Branch</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Request Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-85">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No Monthly SIR requests found.
                </TableCell>
              </TableRow>
            ) : (
              requests.items.map((row, index) => (
                <TableRow key={row.id}>
                  <TableIndexCell
                    index={(requests.page - 1) * requests.limit + index + 1}
                  />
                  <TableCell>
                    <div className="font-medium">{row.branch.name}</div>
                    <div className="text-xs text-muted-foreground">{row.branch.sapCode}</div>
                  </TableCell>
                  <TableCell>{row.requestedBy.name || row.requestedBy.email}</TableCell>
                  <TableCell className="max-w-65 whitespace-normal">{row.purpose}</TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        MONTHLY_SIR_STATUS_VARIANTS[row.status],
                      )}
                    >
                      {MONTHLY_SIR_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {row.status === "pending" && canManage ? (
                        <Button size="sm" onClick={() => setReviewRow(row)}>
                          Review
                        </Button>
                      ) : null}
                      {row.status === "approved" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={downloadKind === "template"}
                            onClick={() => downloadTemplate(row)}
                          >
                            Download template
                          </Button>
                          {row.stockCountSession?.status === "in_progress" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setScans([]);
                                  setScanInput("");
                                  setScanRow(row);
                                }}
                              >
                                Scan serials
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={psUploadClosed}
                                title={
                                  psUploadClosed
                                    ? allowanceForBranch?.message ?? undefined
                                    : undefined
                                }
                                onClick={() => setUploadRow(row)}
                              >
                                Upload P-COUNT
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={downloadKind === "variance"}
                              onClick={() => generateVariance(row)}
                            >
                              Generate variance
                            </Button>
                          )}
                          {row.stockCountSession ? (
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/inventory/stock-count/${row.stockCountSession.id}`}
                              >
                                Open P-Count
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                toast.error(
                                  "No P-Count session is linked. Ask a Team Leader to re-approve this request.",
                                )
                              }
                            >
                              Open P-Count
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {requests.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="outline" size="sm" disabled={requests.page <= 1}>
            <Link href={href({ page: Math.max(1, requests.page - 1) })}>Previous</Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {requests.page} of {requests.totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={requests.page >= requests.totalPages}
          >
            <Link href={href({ page: Math.min(requests.totalPages, requests.page + 1) })}>
              Next
            </Link>
          </Button>
        </div>
      ) : null}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {canDirectUpload ? "Upload P-COUNT" : "Request Monthly SIR"}
            </DialogTitle>
            <DialogDescription>
              {allowanceForBranch?.role === "ps"
                ? canDirectUpload
                  ? "Start a P-COUNT for this branch. Upload is open today."
                  : "Submit a request for approval. The file can only be uploaded on an open day."
                : canDirectUpload
                  ? "Start a free P-COUNT for this branch. Starting uses one free slot right away."
                  : "Submit a branch P-COUNT request for inventory approval."}
            </DialogDescription>
          </DialogHeader>
          <SearchableSelect
            options={branches.map((branch) => ({
              id: branch.id,
              label: `${branch.name} (${branch.sapCode})`,
            }))}
            value={selectedBranchId}
            onChange={setSelectedBranchId}
            placeholder="Select branch"
            searchPlaceholder="Search branches…"
            emptyMessage="No assigned branches."
          />
          {allowanceForBranch && !allowanceForBranch.unlimited ? (
            <div className="space-y-1.5 rounded-lg border bg-muted/30 px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {allowanceForBranch.role === "ps" ? "Upload days" : "Slots"}
              </p>
              {allowanceForBranch.role === "ps" ? (
                <p className="text-sm font-medium text-foreground">
                  {allowanceForBranch.canDirectUpload
                    ? "Upload open today"
                    : "Upload closed today"}
                </p>
              ) : (
                <p className="text-sm font-medium text-foreground">
                  {(allowanceForBranch.slotsRemainingToday ?? 0) > 0
                    ? `${allowanceForBranch.slotsRemainingToday} remaining`
                    : "No free slots left today"}
                </p>
              )}
              {allowanceForBranch.role === "ps" ? (
                <p className="text-xs text-muted-foreground">
                  {allowanceForBranch.message}
                </p>
              ) : null}
              {allowanceForBranch.role === "tl" ? (
                <p className="text-xs text-muted-foreground">
                  {allowanceForBranch.slotsTotalMonth} free per month for this
                  branch
                </p>
              ) : null}
              {allowanceForBranch.role !== "ps" && allowanceForBranch.mustRequest ? (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  Extra upload needs approval first
                </p>
              ) : null}
            </div>
          ) : null}
          <Textarea
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Purpose of this monthly count"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button
              disabled={
                pending ||
                allowanceLoading ||
                !selectedBranchId ||
                purpose.trim().length < 3
              }
              onClick={submitStart}
            >
              {canDirectUpload ? "Start upload" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewRow)} onOpenChange={(open) => !open && setReviewRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Monthly SIR request</DialogTitle>
            <DialogDescription>
              Approval creates and starts a linked P-Count session.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Review remarks (optional)"
            maxLength={1000}
          />
          <DialogFooter>
            <Button variant="destructive" disabled={pending} onClick={() => review("reject")}>
              Disapprove
            </Button>
            <Button disabled={pending} onClick={() => review("approve")}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(uploadRow)}
        onOpenChange={(open) => {
          if (!open) {
            setUploadRow(null);
            setUploadFile(null);
            setPreview(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload P-COUNT file</DialogTitle>
            <DialogDescription>
              Preview checks that each P-Count is DEF, STK, or DU. Serials that are not in the system yet are still accepted.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setUploadFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
          {preview ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">{preview.rowCount} rows ready</p>
              <p>{preview.counts.map((item) => `${item.status}: ${item.count}`).join(" · ")}</p>
              {preview.invalidSerials.length ? (
                <p className="text-destructive">
                  Unknown serials: {preview.invalidSerials.join(", ")}
                </p>
              ) : null}
              {preview.invalidStatuses.length ? (
                <p className="text-destructive">
                  Invalid statuses: {preview.invalidStatuses.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            {!preview ? (
              <Button disabled={pending || !uploadFile} onClick={previewUpload}>Preview</Button>
            ) : (
              <Button
                disabled={
                  pending ||
                  preview.invalidSerials.length > 0 ||
                  preview.invalidStatuses.length > 0
                }
                onClick={applyUpload}
              >
                Confirm upload
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(scanRow)}
        onOpenChange={(open) => {
          if (!open && downloadKind !== "scans-excel") {
            setScanRow(null);
            setScanInput("");
            setScans([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Scan serials</DialogTitle>
            <DialogDescription>
              Keep the cursor in the field and scan with a scanner.
              Each Enter adds one serial. Serials that are not in the catalog
              are still included, with a blank model. Build the Excel file,
              review it, then use Upload P-COUNT.
            </DialogDescription>
          </DialogHeader>
          <form className="flex gap-2" onSubmit={addScan}>
            <Input
              autoFocus
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              placeholder="Scan or enter serial number"
              autoComplete="off"
              aria-label="Serial number"
            />
            <Button type="submit" disabled={!scanInput.trim()}>
              Add
            </Button>
          </form>
          <div className="flex gap-4 text-sm">
            <span>
              Scanned: <strong>{scans.length}</strong>
            </span>
            <span>
              Unique valid:{" "}
              <strong>{scans.filter((scan) => scan.status === "valid").length}</strong>
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {scans.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No serials scanned yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial number</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="w-14">
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-mono text-sm">
                        {scan.serialNo}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={scan.status === "invalid" ? "destructive" : "outline"}
                        >
                          {scan.status === "validating"
                            ? "Checking"
                            : scan.status === "valid"
                              ? "OK"
                              : scan.status === "invalid"
                                ? "Not in catalog"
                                : "Duplicate"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${scan.serialNo}`}
                          onClick={() =>
                            setScans((current) =>
                              current.filter((item) => item.id !== scan.id),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={downloadKind === "scans-excel"}
              onClick={() => setScanRow(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                downloadKind === "scans-excel" ||
                scans.some((scan) => scan.status === "validating") ||
                !scans.some(
                  (scan) => scan.status === "valid" || scan.status === "invalid",
                )
              }
              onClick={buildExcelFromScans}
            >
              Build Excel from scans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoadingModal
        open={downloadKind !== null}
        variant="minimal"
        title="Preparing download"
        description="Please wait while we build your Excel file."
      />
    </div>
  );
}
