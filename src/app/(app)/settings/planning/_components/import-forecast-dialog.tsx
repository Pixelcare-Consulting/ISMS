"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  applyForecastImportChunkAction,
  downloadForecastImportTemplateAction,
  previewForecastImportAction,
} from "@/features/forecast/actions/forecast-import.actions";
import type { ForecastImportPreview } from "@/features/forecast/schemas/forecast-import.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportApplyProgress } from "@/components/ui/import-apply-progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function downloadWorkbook(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function actionLabel(action: "create" | "update" | "skip"): string {
  switch (action) {
    case "create":
      return "Create";
    case "update":
      return "Update";
    case "skip":
      return "Unchanged";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function ImportForecastDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ForecastImportPreview | null>(null);
  const [pending, startTransition] = useTransition();
  const [applyProgress, setApplyProgress] = useState<{
    processed: number;
    total: number;
    elapsedMs: number;
  } | null>(null);

  const applying = applyProgress !== null;
  const busy = pending || applying;

  function reset() {
    setFile(null);
    setPreview(null);
    setApplyProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(next: boolean) {
    if (applying) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleTemplate() {
    startTransition(async () => {
      const base64 = await downloadForecastImportTemplateAction();
      downloadWorkbook(base64, "forecast-import-template.xlsx");
    });
  }

  function handleFile(selected: File) {
    setFile(selected);
    setPreview(null);
    const formData = new FormData();
    formData.set("file", selected);
    startTransition(async () => {
      const result = await previewForecastImportAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        reset();
        return;
      }
      setPreview(result.preview);
    });
  }

  function handleApply() {
    if (!file || !preview || applying) return;

    const startedAtMs = Date.now();
    const unchangedCount = preview.unchangedCount;

    startTransition(async () => {
      let offset = 0;
      let lastProcessed = 0;
      let lastTotal = 0;
      let created = 0;
      let updated = 0;

      setApplyProgress({ processed: 0, total: 0, elapsedMs: 0 });

      let planKey = preview.planKey;
      let resendFile = !planKey;

      try {
        for (;;) {
          const formData = new FormData();
          if (resendFile || !planKey) formData.set("file", file);
          if (planKey) formData.set("planKey", planKey);
          formData.set("offset", String(offset));

          const progress = await applyForecastImportChunkAction(formData);
          if ("error" in progress) {
            toast.error(
              `${progress.error} Stopped after ${lastProcessed} of ${lastTotal || "?"}. You can try Apply again.`,
            );
            setApplyProgress(null);
            return;
          }

          if (progress.planExpired) {
            if (resendFile) {
              toast.error(
                `Import failed. Stopped after ${lastProcessed} of ${lastTotal || "?"}. You can try Apply again.`,
              );
              setApplyProgress(null);
              return;
            }
            resendFile = true;
            continue;
          }

          resendFile = false;
          if (progress.planKey) planKey = progress.planKey;

          created += progress.created;
          updated += progress.updated;
          lastProcessed = progress.processed;
          lastTotal = progress.total;

          setApplyProgress({
            processed: progress.processed,
            total: progress.total,
            elapsedMs: Date.now() - startedAtMs,
          });

          if (progress.done) {
            const period = progress.periodLabel || preview.periodLabel;
            const parts = [
              `Period ${period}`,
              `${created} created`,
              `${updated} updated`,
              `${unchangedCount} unchanged`,
            ];
            toast.success(parts.join(" · "));
            setApplyProgress(null);
            handleClose(false);
            router.refresh();
            return;
          }

          offset = progress.nextOffset;
        }
      } catch (error) {
        toast.error(
          `${error instanceof Error ? error.message : "Import failed."} Stopped after ${lastProcessed} of ${lastTotal || "?"}. You can try Apply again.`,
        );
        setApplyProgress(null);
      }
    });
  }

  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const showChangesColumn =
    preview?.rows.some((row) => row.action === "update" && row.changes.length > 0) ?? false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!applying}
        onPointerDownOutside={(event) => {
          if (applying) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (applying) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import forecast</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-muted-foreground space-y-2 text-sm">
            <p>
              Download the <strong>Forecast</strong> template, fill in period, branch SAP
              code, and revenue target, then upload that same file. The old BRS wide
              spreadsheet is not accepted here.
            </p>
            <p>
              Branches must already exist — this import does not create branches, SKUs, or
              planogram rows. Shelf max stays on Planogram. Rows left out of the file are
              not removed.
            </p>
            <p>
              Keep Forecast period as text (<strong>Dec-25</strong>), not an Excel date.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) handleFile(selected);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 size-4" />
              {file ? "Choose another file" : "Choose file"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={handleTemplate}>
              <Download className="mr-1 size-4" />
              Download template
            </Button>
            {file ? (
              <span className="text-muted-foreground text-sm">{file.name}</span>
            ) : null}
          </div>

          {applyProgress ? (
            <ImportApplyProgress
              label="Importing…"
              processed={applyProgress.processed}
              total={applyProgress.total}
              elapsedMs={applyProgress.elapsedMs}
            />
          ) : null}

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 rounded-lg border px-4 py-3 text-sm">
                <span>
                  Period <strong>{preview.periodLabel || "—"}</strong>
                  {preview.periodWillActivate ? " (will be set active)" : ""}
                </span>
                <span>
                  <strong>{preview.rowCount}</strong> rows
                </span>
                <span>
                  <strong>{preview.createCount}</strong> to create
                </span>
                <span>
                  <strong>{preview.updateCount}</strong> to update
                </span>
                <span className="text-muted-foreground">
                  {preview.unchangedCount} unchanged (skipped)
                </span>
              </div>

              {hasErrors ? (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-destructive text-sm font-medium">
                    {preview.errors.length} problem
                    {preview.errors.length === 1 ? "" : "s"} found — fix the spreadsheet and
                    upload again.
                  </p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                    {preview.errors.slice(0, 100).map((error, index) => (
                      <li key={`${error.sheet}-${error.rowNumber}-${index}`}>
                        <span className="text-muted-foreground">
                          {error.sheet} · row {error.rowNumber}
                          {error.sapCode !== "—" ? ` · ${error.sapCode}` : ""}
                        </span>{" "}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                  {preview.errors.length > 100 ? (
                    <p className="text-muted-foreground text-xs">
                      Showing the first 100 of {preview.errors.length}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {preview.rows.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch SAP code</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead>Action</TableHead>
                        {showChangesColumn ? <TableHead>Changes</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={`${row.sapCode}-${row.rowNumber}`}>
                          <TableCell className="font-mono text-xs">{row.sapCode}</TableCell>
                          <TableCell className="text-sm">{row.branchName}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.revenueTarget.toLocaleString("en-PH")}
                          </TableCell>
                          <TableCell className="text-sm">{actionLabel(row.action)}</TableCell>
                          {showChangesColumn ? (
                            <TableCell className="text-sm">
                              {row.changes.length === 0 ? (
                                <span className="text-muted-foreground">No field changes</span>
                              ) : (
                                row.changes.map((change) => (
                                  <div key={`${change.field}-${change.to}`}>
                                    {change.label}: {change.from} →{" "}
                                    <strong>{change.to}</strong>
                                  </div>
                                ))
                              )}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : !hasErrors ? (
                <p className="text-muted-foreground text-sm">
                  Everything in this file already matches the system. Nothing to import.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={busy || !preview?.canApply}>
            {applying ? "Importing…" : pending ? "Working…" : "Apply import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
