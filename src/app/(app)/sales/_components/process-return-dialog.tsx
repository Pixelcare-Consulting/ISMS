"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { SaleDetailsPayload } from "@/app/(app)/sales/_components/sale-details-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listProcessReturnLookupsAction,
  requestReturnAction,
  type ProcessReturnPayload,
} from "@/features/sales/actions/sales.actions";
import {
  isServiceDocumentTypeName,
  RETURN_CLASSIFICATION_OPTIONS,
  RETURN_NATURE_OF_TRANSACTION_OPTIONS,
  RETURN_STOCK_STATUS_OPTIONS,
  type ReturnStockStatusValue,
} from "@/features/sales/constants/process-return";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { cn } from "@/utils/cn";

type LookupOption = { id: string; name: string };

type ProcessReturnDialogProps = {
  sale: SaleDetailsPayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
};

function ProcessReturnFormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ProcessReturnDialog({
  sale,
  open,
  onOpenChange,
  onSubmitted,
}: ProcessReturnDialogProps) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [documentTypes, setDocumentTypes] = useState<LookupOption[]>([]);
  const [problems, setProblems] = useState<LookupOption[]>([]);
  const [serviceCenters, setServiceCenters] = useState<LookupOption[]>([]);
  const [models, setModels] = useState<LookupOption[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<LookupOption[]>(
    [],
  );

  const [documentTypeId, setDocumentTypeId] = useState("");
  const [stockStatusCode, setStockStatusCode] =
    useState<ReturnStockStatusValue>("STK");
  const [problemIds, setProblemIds] = useState<string[]>([]);
  const [problemQuery, setProblemQuery] = useState("");
  const [serviceCenterId, setServiceCenterId] = useState("");
  const [classification, setClassification] = useState("");
  const [serviceModelId, setServiceModelId] = useState("");
  const [customerDealerBranch, setCustomerDealerBranch] = useState(
    sale.customerName ?? "",
  );
  const [natureOfTransaction, setNatureOfTransaction] = useState("");
  const [refContactPo, setRefContactPo] = useState("");
  const [warehouseLocationId, setWarehouseLocationId] = useState("");

  const primaryLine = sale.lines[0];
  const headerModel = primaryLine?.modelLabel ?? "—";
  const headerSn = primaryLine?.serialNo ?? TO_FOLLOW_SERIAL_LABEL;

  const selectedDocType = documentTypes.find((d) => d.id === documentTypeId);
  const showServiceExtras = isServiceDocumentTypeName(selectedDocType?.name);

  const filteredProblems = useMemo(() => {
    const q = problemQuery.trim().toLowerCase();
    if (!q) return problems;
    return problems.filter((p) => p.name.toLowerCase().includes(q));
  }, [problems, problemQuery]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startTransition(() => {
      setLoading(true);
    });
    void (async () => {
      try {
        const lookups = await listProcessReturnLookupsAction();
        if (cancelled) return;
        setDocumentTypes(lookups.documentTypes);
        setProblems(lookups.problemDescriptions);
        setServiceCenters(lookups.serviceCenters);
        setModels(lookups.models);
        setWarehouseLocations(lookups.warehouseLocations);
      } catch {
        if (!cancelled) toast.error("Failed to load Process Return lookups");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function toggleProblem(id: string) {
    setProblemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function validate(): string | null {
    if (!documentTypeId) return "Document type is required";
    if (!stockStatusCode) return "Stock status is required";
    if (problemIds.length === 0) return "Select at least one problem description";
    if (showServiceExtras && !serviceCenterId) {
      return "Service center is required for Service Return";
    }
    return null;
  }

  function submit(actionType: ProcessReturnPayload["actionType"]) {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const payload: ProcessReturnPayload = {
      documentTypeId,
      stockStatusCode,
      actionType,
      problemDescriptionIds: problemIds,
      serviceCenterId: showServiceExtras ? serviceCenterId || null : null,
      classification: showServiceExtras ? classification || null : null,
      serviceModelId: showServiceExtras ? serviceModelId || null : null,
      customerDealerBranch: showServiceExtras
        ? customerDealerBranch || null
        : null,
      natureOfTransaction: showServiceExtras
        ? natureOfTransaction || null
        : null,
      refContactPo: showServiceExtras ? refContactPo || null : null,
      warehouseLocationId: showServiceExtras
        ? warehouseLocationId || null
        : null,
    };

    startTransition(async () => {
      const res = await requestReturnAction(sale.id, payload);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        actionType === "replacement"
          ? "Replacement request submitted"
          : "Return request submitted",
      );
      onOpenChange(false);
      onSubmitted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] w-[min(calc(100vw-2rem),36rem)] max-w-xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>Process Return</DialogTitle>
          <DialogDescription>
            Capture document type, stock status, and problems, then choose
            Return or Replacement.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-muted-foreground">Transaction</dt>
                <dd className="font-mono font-medium">{sale.transactionNo}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-muted-foreground">Branch</dt>
                <dd>{sale.branch.name}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-muted-foreground">Model</dt>
                <dd className="font-mono text-sm">{headerModel}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-muted-foreground">Serial</dt>
                <dd className="font-mono text-sm">{headerSn}</dd>
              </div>
            </dl>
          </div>

          {loading ? (
            <ProcessReturnFormSkeleton />
          ) : (
            <>
              <SearchableSelect
                label="Document Type *"
                options={documentTypes.map((d) => ({
                  id: d.id,
                  label: d.name,
                }))}
                value={documentTypeId}
                onChange={setDocumentTypeId}
                placeholder="Select document type…"
                disabled={pending}
                popoverClassName="z-70"
              />

              <div className="space-y-2">
                <Label>Stock Status *</Label>
                <div className="flex flex-wrap gap-2">
                  {RETURN_STOCK_STATUS_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={
                        stockStatusCode === opt.value ? "default" : "outline"
                      }
                      disabled={pending}
                      onClick={() => setStockStatusCode(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {showServiceExtras ? (
                <div className="space-y-3 rounded-md border border-dashed p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Service Return
                  </p>
                  <SearchableSelect
                    label="Service Center *"
                    options={serviceCenters.map((s) => ({
                      id: s.id,
                      label: s.name,
                    }))}
                    value={serviceCenterId}
                    onChange={setServiceCenterId}
                    placeholder="Select service center…"
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                  <SearchableSelect
                    label="Classification"
                    options={RETURN_CLASSIFICATION_OPTIONS.map((name) => ({
                      id: name,
                      label: name,
                    }))}
                    value={classification}
                    onChange={setClassification}
                    placeholder="Select classification…"
                    allowClear
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                  <SearchableSelect
                    label="Models"
                    options={models.map((m) => ({
                      id: m.id,
                      label: m.name,
                    }))}
                    value={serviceModelId}
                    onChange={setServiceModelId}
                    placeholder="Select model…"
                    allowClear
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="customer-dealer-branch">
                      Customer Name / Dealer Branch
                    </Label>
                    <Input
                      id="customer-dealer-branch"
                      value={customerDealerBranch}
                      onChange={(e) => setCustomerDealerBranch(e.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <SearchableSelect
                    label="Nature of Transaction"
                    options={RETURN_NATURE_OF_TRANSACTION_OPTIONS.map(
                      (name) => ({ id: name, label: name }),
                    )}
                    value={natureOfTransaction}
                    onChange={setNatureOfTransaction}
                    placeholder="Select nature…"
                    allowClear
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="ref-contact-po">Ref. Contact / P.O no</Label>
                    <Input
                      id="ref-contact-po"
                      value={refContactPo}
                      onChange={(e) => setRefContactPo(e.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <SearchableSelect
                    label="Warehouse Location"
                    options={warehouseLocations.map((w) => ({
                      id: w.id,
                      label: w.name,
                    }))}
                    value={warehouseLocationId}
                    onChange={setWarehouseLocationId}
                    placeholder="Select warehouse location…"
                    allowClear
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Problem Description *</Label>
                  <span className="text-xs text-muted-foreground">
                    {problemIds.length} selected
                  </span>
                </div>
                <Input
                  value={problemQuery}
                  onChange={(e) => setProblemQuery(e.target.value)}
                  placeholder="Search problems…"
                  disabled={pending}
                />
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {filteredProblems.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">
                      No problem descriptions found.
                    </p>
                  ) : (
                    filteredProblems.map((problem) => {
                      const checked = problemIds.includes(problem.id);
                      return (
                        <label
                          key={problem.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60",
                            checked && "bg-muted/40",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleProblem(problem.id)}
                            disabled={pending}
                            className="mt-0.5"
                          />
                          <span>{problem.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-1 shrink-0 border-t pt-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || loading}
            onClick={() => submit("return")}
          >
            {pending ? "Working…" : "Return"}
          </Button>
          <Button
            type="button"
            disabled={pending || loading}
            onClick={() => submit("replacement")}
          >
            {pending ? "Working…" : "Replacement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
