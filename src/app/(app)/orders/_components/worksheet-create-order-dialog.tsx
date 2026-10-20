"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AdditionalItemDialog } from "@/app/(app)/orders/_components/additional-item-dialog";
import { OrderWorksheet } from "@/app/(app)/orders/_components/order-worksheet";
import type { CreateOrderPrefill } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingModal } from "@/components/ui/loading-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  checkOrderWindowAction,
  createOrderAction,
  listActiveDealersForOrderAction,
  listBranchesForOrderAction,
} from "@/features/orders/actions/order.actions";
import {
  getOrderWorksheetAction,
  listSpecialOrderModelsAction,
} from "@/features/orders/actions/order-worksheet.actions";
import { buildOrderCreateDetails } from "@/features/orders/lib/order-create-details";
import {
  EMPTY_WORKSHEET_DRAFT,
  projectWorksheetLines,
  type WorksheetDraftInput,
} from "@/features/orders/lib/order-worksheet-rows";
import type { OrderWorksheetPayload } from "@/features/orders/types/order-analytics";

const CREATE_ORDER_MIN_LOADING_MS = 2000;

interface SpecialModelOption {
  id: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeLoadedDrafts(
  prev: Readonly<Record<string, WorksheetDraftInput>>,
  lines: OrderWorksheetPayload["lines"],
  additionalIds: ReadonlySet<string>,
): Record<string, WorksheetDraftInput> {
  const next: Record<string, WorksheetDraftInput> = {};
  for (const line of lines) {
    const existing = prev[line.modelId];
    const additionalItem = Boolean(existing?.additionalItem) || additionalIds.has(line.modelId);
    if (existing) {
      next[line.modelId] = { ...existing, additionalItem };
      continue;
    }
    next[line.modelId] = {
      ...EMPTY_WORKSHEET_DRAFT,
      requestedQty: additionalItem ? 1 : 0,
      additionalItem,
    };
  }
  return next;
}

export function WorksheetCreateOrderDialog({
  onClose,
  fixedOrderType = "manual",
  prefill,
  canCreateSpecial,
  stacked = false,
}: {
  onClose: () => void;
  fixedOrderType?: "manual" | "special";
  prefill?: CreateOrderPrefill;
  canCreateSpecial: boolean;
  stacked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const orderType = fixedOrderType;
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<
    { id: string; name: string; dealerId: string | null }[]
  >([]);
  const [dealerId, setDealerId] = useState(prefill?.dealerId ?? "");
  const [branchId, setBranchId] = useState(prefill?.branchId ?? "");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [worksheet, setWorksheet] = useState<OrderWorksheetPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, WorksheetDraftInput>>({});
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [windowBlock, setWindowBlock] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SpecialModelOption[]>([]);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [loadingWorksheet, setLoadingWorksheet] = useState(false);
  const [specialOpen, setSpecialOpen] = useState(false);
  const additionalKey = additionalIds.join("\n");
  const branchIdRef = useRef(branchId);
  useEffect(() => {
    branchIdRef.current = branchId;
  }, [branchId]);
  const projectedLines = useMemo(() => {
    if (!worksheet) return [];
    return projectWorksheetLines(worksheet.lines, drafts, orderType, "create");
  }, [drafts, orderType, worksheet]);
  const createDetails = useMemo(
    () => buildOrderCreateDetails(projectedLines, new Set(removedIds)),
    [projectedLines, removedIds],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [dealerRows, branchRows] = await Promise.all([
        listActiveDealersForOrderAction(orderType),
        listBranchesForOrderAction(prefill?.dealerId || undefined, orderType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setBranches(branchRows);
      if (prefill?.branchId && !prefill.dealerId) {
        const match = branchRows.find((branch) => branch.id === prefill.branchId);
        if (match?.dealerId) setDealerId(match.dealerId);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderType, prefill?.branchId, prefill?.dealerId]);

  useEffect(() => {
    if (!loaded || !dealerId) return;
    let cancelled = false;
    void listBranchesForOrderAction(dealerId, orderType).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      const current = branchIdRef.current;
      const next = branchRows.some((branch) => branch.id === current)
        ? current
        : (branchRows[0]?.id ?? "");
      if (next !== current) {
        setDrafts({});
        setAdditionalIds([]);
        setWorksheet(null);
        setBranchId(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dealerId, loaded, orderType]);

  useEffect(() => {
    let cancelled = false;
    const branch = branchId;
    const ids = additionalKey ? additionalKey.split("\n") : [];
    void (async () => {
      if (!branch) {
        if (!cancelled) {
          setWindowBlock(null);
          setWorksheet(null);
          setLoadingWorksheet(false);
        }
        return;
      }
      setLoadingWorksheet(true);
      const [windowRes, worksheetRes] = await Promise.all([
        checkOrderWindowAction(branch, orderType),
        getOrderWorksheetAction({
          branchId: branch,
          orderType,
          existingModelIds: ids,
        }),
      ]);
      if (cancelled) return;
      setWindowBlock(windowRes.blocked ? windowRes.reason : null);
      if ("error" in worksheetRes) {
        toast.error(worksheetRes.error);
        setWorksheet(null);
        setLoadingWorksheet(false);
        return;
      }
      setWorksheet(worksheetRes.data);
      setDrafts((prev) => mergeLoadedDrafts(prev, worksheetRes.data.lines, new Set(ids)));
      setLoadingWorksheet(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [additionalKey, branchId, orderType]);

  useEffect(() => {
    if (orderType !== "special" || !branchId) return;
    let cancelled = false;
    void listSpecialOrderModelsAction().then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        toast.error(result.error);
        setCatalog([]);
        return;
      }
      setCatalog(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, orderType]);

  const sheetLines = useMemo(() => {
    if (!worksheet) return [];
    const removed = new Set(removedIds);
    return worksheet.lines.filter((line) => !removed.has(line.modelId));
  }, [removedIds, worksheet]);

  const addableModels = useMemo(() => {
    const onSheet = new Set(sheetLines.map((line) => line.modelId));
    return catalog.filter((model) => !onSheet.has(model.id));
  }, [catalog, sheetLines]);

  function resetBranchWorksheet() {
    setWorksheet(null);
    setDrafts({});
    setAdditionalIds([]);
    setRemovedIds([]);
  }

  function updateDraft(modelId: string, patch: Partial<WorksheetDraftInput>) {
    setDrafts((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? EMPTY_WORKSHEET_DRAFT), ...patch },
    }));
  }

  function addExtraItems(ids: string[]) {
    if (!worksheet || ids.length === 0) return;
    const removed = new Set(removedIds);
    const visible = new Set(sheetLines.map((line) => line.modelId));
    const known = new Set(worksheet.lines.map((line) => line.modelId));
    const restore = ids.filter((id) => removed.has(id) && known.has(id));
    const duplicates = ids.filter((id) => visible.has(id));
    const toAdd = ids.filter((id) => !visible.has(id) && !known.has(id));
    if (duplicates.length > 0) {
      toast.error("That model is already on the worksheet.");
    }
    if (restore.length > 0) {
      setRemovedIds((prev) => prev.filter((id) => !restore.includes(id)));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of restore) {
          next[id] = {
            ...(next[id] ?? EMPTY_WORKSHEET_DRAFT),
            requestedQty: 1,
            additionalItem: true,
          };
        }
        return next;
      });
    }
    if (toAdd.length === 0) return;
    setAdditionalIds((prev) => [...new Set([...prev, ...toAdd])]);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of toAdd) {
        next[id] = {
          ...(next[id] ?? EMPTY_WORKSHEET_DRAFT),
          requestedQty: 1,
          additionalItem: true,
        };
      }
      return next;
    });
  }

  function removeLine(modelId: string) {
    const additional =
      additionalIds.includes(modelId) || Boolean(drafts[modelId]?.additionalItem);
    if (additional) {
      setAdditionalIds((prev) => prev.filter((id) => id !== modelId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      return;
    }
    setRemovedIds((prev) => (prev.includes(modelId) ? prev : [...prev, modelId]));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }

  function submit() {
    if (!worksheet || createDetails.length === 0) return;
    const orderedIds = new Set(createDetails.map((line) => line.modelId));
    const zeroSrp = projectedLines.filter((line) => orderedIds.has(line.modelId) && line.srp <= 0);
    startTransition(async () => {
      if (zeroSrp.length > 0) {
        const labels = zeroSrp.map((line) => line.skuCode).join(", ");
        toast.warning(
          zeroSrp.length === 1
            ? `${labels} has SRP = 0. Order amount for this SKU will be ₱0.`
            : `${labels} have SRP = 0. Order amount for these SKUs will be ₱0.`,
        );
      }
      const started = Date.now();
      const result = await createOrderAction({
        branchId,
        orderType,
        notes: notes.trim() || undefined,
        details: createDetails,
      });
      const waitMs = CREATE_ORDER_MIN_LOADING_MS - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        orderType === "special"
          ? "Special order submitted for SP approval"
          : "Manual order submitted for Supply Planning approval",
      );
      onClose();
      router.refresh();
    });
  }

  const submitDisabled =
    pending ||
    !loaded ||
    !dealerId ||
    !branchId ||
    windowBlock !== null ||
    loadingWorksheet ||
    !worksheet ||
    createDetails.length === 0;

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && specialOpen) return;
          if (!next && !pending) onClose();
        }}
      >
        <DialogContent
          showCloseButton
          overlayClassName={stacked ? "z-[70]" : "z-[65]"}
          className={
            stacked
              ? "z-[80] flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-[90rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90rem] sm:p-0"
              : "z-[65] flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-[90rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90rem] sm:p-0"
          }
        >
          <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
            <DialogTitle>
              {orderType === "special" ? "Create special order" : "Create manual order"}
            </DialogTitle>
            <DialogDescription className="max-w-3xl">
              {orderType === "special"
                ? "Add any active model, then enter a quantity. Leave the rest at zero."
                : "Enter a quantity for each model you want. Leave the rest at zero."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
            <aside className="flex w-full shrink-0 flex-col gap-4 border-b px-4 py-4 sm:px-6 xl:w-80 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-5">
              {!loaded ? (
                <p className="text-sm text-muted-foreground">Loading dealers and branches…</p>
              ) : (
                <>
                  <SearchableSelect
                    label="Dealer"
                    className="w-full"
                    popoverClassName="z-[100]"
                    options={dealers.map((dealer) => ({ id: dealer.id, label: dealer.name }))}
                    value={dealerId}
                    onChange={(next) => {
                      setDealerId(next);
                      setBranchId("");
                      resetBranchWorksheet();
                      setSpecialOpen(false);
                    }}
                    allowClear
                    placeholder="Select dealer…"
                    searchPlaceholder="Search dealers…"
                  />
                  <SearchableSelect
                    label="Branch"
                    className="w-full"
                    popoverClassName="z-[100]"
                    options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
                    value={branchId}
                    onChange={(next) => {
                      setBranchId(next);
                      resetBranchWorksheet();
                      setSpecialOpen(false);
                    }}
                    placeholder={dealerId ? "Select branch…" : "Select a dealer first…"}
                    searchPlaceholder="Search branches…"
                    disabled={!dealerId}
                    emptyMessage="No active branches for this dealer."
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor={`${orderType}-special-instruction`}>Note for this order</Label>
                    <Textarea
                      id={`${orderType}-special-instruction`}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Optional"
                      rows={4}
                      className="min-h-24 resize-none"
                      aria-label="Note for this order"
                    />
                  </div>
                </>
              )}
              {windowBlock ? (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {windowBlock}
                </p>
              ) : null}
            </aside>
            <div className="flex min-h-[24rem] min-w-0 flex-1 flex-col px-4 py-3 sm:px-6 xl:min-h-0 xl:overflow-hidden">
              {!branchId ? (
                <p className="text-sm text-muted-foreground">
                  Select a dealer and branch to load models.
                </p>
              ) : (
                <OrderWorksheet
                  lines={sheetLines}
                  brands={worksheet?.brands ?? []}
                  drafts={drafts}
                  mode="create"
                  orderType={orderType}
                  loading={loadingWorksheet}
                  summary={worksheet?.summary ?? null}
                  summaryMode="current"
                  showApprovedQty={false}
                  approvedQtyEditable={false}
                  showSpRemarks={false}
                  spRemarksEditable={false}
                  onRequestedQtyChange={(modelId, quantity) =>
                    updateDraft(modelId, {
                      requestedQty: Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0,
                    })
                  }
                  onRemarksChange={(modelId, remarks) => updateDraft(modelId, { remarks })}
                  onRemoveAdditional={removeLine}
                  filterAction={
                    orderType === "special" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8"
                        disabled={!worksheet}
                        onClick={() => setAdditionalOpen(true)}
                      >
                        Additional item
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8"
                        disabled={!canCreateSpecial || !branchId}
                        title={
                          canCreateSpecial
                            ? "Opens a separate special order for this branch. This manual order is not submitted."
                            : "You do not have permission to order an extra item."
                        }
                        onClick={() => setSpecialOpen(true)}
                      >
                        Additional item
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={submitDisabled} onClick={submit}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {orderType === "special" && additionalOpen ? (
        <AdditionalItemDialog
          open
          stacked={stacked}
          models={addableModels}
          onOpenChange={setAdditionalOpen}
          onAdd={addExtraItems}
        />
      ) : null}
      {specialOpen && orderType === "manual" ? (
        <WorksheetCreateOrderDialog
          stacked
          fixedOrderType="special"
          canCreateSpecial={false}
          prefill={{ dealerId, branchId }}
          onClose={() => setSpecialOpen(false)}
        />
      ) : null}
      <LoadingModal
        open={pending}
        variant="minimal"
        title="Processing order"
        description="Please wait while we process the order."
      />
    </>
  );
}
