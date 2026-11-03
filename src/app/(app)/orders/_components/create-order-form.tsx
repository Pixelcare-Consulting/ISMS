"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AdditionalItemDialog } from "@/app/(app)/orders/_components/additional-item-dialog";
import {
  OrderWorksheet,
  OrderWorksheetAsideSummary,
} from "@/app/(app)/orders/_components/order-worksheet";
import type { CreateOrderPrefill } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import {
  ORDER_FOR_LABELS,
  orderSetupHref,
  scOrderSetupBlock,
  ServiceCenterSetupFields,
  useScOrderSetup,
  type BranchOrderSetupChoice,
  type OrderFor,
  type OrderSetupChoice,
} from "@/app/(app)/orders/_components/service-center-order-setup";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingModal } from "@/components/ui/loading-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { MODE_OF_PAYMENT_KIND_LABELS } from "@/features/lookups/constants/mode-of-payment-kind";
import { formatPeso } from "@/utils/format-currency";
import {
  checkOrderWindowAction,
  createOrderAction,
  listActiveDealersForOrderAction,
  listBranchesForOrderAction,
  listModesOfPaymentForOrderAction,
} from "@/features/orders/actions/order.actions";
import {
  getOrderWorksheetAction,
  listSpecialOrderModelsAction,
} from "@/features/orders/actions/order-worksheet.actions";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { buildOrderCreateDetails } from "@/features/orders/lib/order-create-details";
import {
  branchDealerFilter,
  orderPartyBlock,
  type OrderBranchOption,
  type OrderDealerOption,
  type OrderModeOfPaymentOption,
} from "@/features/orders/lib/order-party";
import { worksheetOrderTotals } from "@/features/orders/lib/order-worksheet-filters";
import { formatWorksheetCbm } from "@/features/orders/lib/order-worksheet-metrics";
import {
  EMPTY_WORKSHEET_DRAFT,
  projectWorksheetLines,
  type WorksheetDraftInput,
} from "@/features/orders/lib/order-worksheet-rows";
import type { OrderWorksheetPayload } from "@/features/orders/types/order-analytics";

const CREATE_ORDER_MIN_LOADING_MS = 2000;
/** Lines named on the submit summary. The rest are a remaining count. */
const SUBMIT_PREVIEW_LIMIT = 8;

const SPECIAL_ORDER_NOTICE_CLASS =
  "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950";

const ORDER_PARTY_BLOCK_CLASS =
  "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive";

const SPECIAL_ORDER_NOTICE =
  "This order is Special because it has items that are not on the shelf plan. Supply Planning approves it. Remove those items to make it Manual again.";

type CreatableOrderType = "manual" | "special";

interface SpecialModelOption {
  id: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
}


type PendingConfirm =
  | { kind: "dealer"; dealerId: string }
  | { kind: "branch"; branchId: string }
  | { kind: "setup"; choice: BranchOrderSetupChoice }
  | { kind: "leave"; href: string };

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

function listHrefFor(orderType: CreatableOrderType): string {
  return `/orders/manual?type=${orderType}`;
}

function OrderReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 min-h-10 break-words rounded-lg bg-muted/70 px-3 py-2.5 text-sm font-medium leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

function confirmCopy(pending: PendingConfirm): { title: string; description: string; action: string } {
  switch (pending.kind) {
    case "dealer":
    case "branch":
    case "setup":
      return {
        title: "Clear the lines on this order?",
        description:
          "Changing the mode of payment, dealer, or branch clears quantities and extra items. The note for this order stays.",
        action: "Continue",
      };
    case "leave":
      return {
        title: "Leave this order?",
        description: "This order has not been submitted. What you entered will be lost.",
        action: "Leave",
      };
    default: {
      const _exhaustive: never = pending;
      return _exhaustive;
    }
  }
}

export function CreateOrderForm({
  canCreateManual,
  canCreateSpecial,
  canCreateServiceCenter = false,
  prefill,
  initialReady = false,
  initialModeOfPaymentId = "",
}: {
  canCreateManual: boolean;
  canCreateSpecial: boolean;
  canCreateServiceCenter?: boolean;
  prefill?: CreateOrderPrefill;
  /** Set after the setup popup's Continue. A direct visit stays in the popup. */
  initialReady?: boolean;
  initialModeOfPaymentId?: string;
}) {
  const router = useRouter();
  const allowLeave = useRef(false);
  const submitStarted = useRef(false);
  const startReady = Boolean(initialReady && initialModeOfPaymentId && prefill?.branchId);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(startReady);
  const [setupOpen, setSetupOpen] = useState(!startReady);
  const [touched, setTouched] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [dealers, setDealers] = useState<OrderDealerOption[]>([]);
  const [modesOfPayment, setModesOfPayment] = useState<OrderModeOfPaymentOption[]>([]);
  const [modeOfPaymentId, setModeOfPaymentId] = useState(
    startReady ? initialModeOfPaymentId : "",
  );
  const [branches, setBranches] = useState<OrderBranchOption[]>([]);
  const [dealerId, setDealerId] = useState(startReady ? (prefill?.dealerId ?? "") : "");
  const [branchId, setBranchId] = useState(startReady ? (prefill?.branchId ?? "") : "");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [worksheet, setWorksheet] = useState<OrderWorksheetPayload | null>(null);
  const [worksheetError, setWorksheetError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, WorksheetDraftInput>>({});
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [windowBlock, setWindowBlock] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SpecialModelOption[]>([]);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [loadingWorksheet, setLoadingWorksheet] = useState(false);
  const additionalKey = additionalIds.join("\n");
  /** Manual unless the user may only create special orders. Lookups use it for permissions. */
  const baseType: CreatableOrderType = canCreateManual ? "manual" : "special";
  // The order type follows the lines: an off-plan (additional) item makes it Special,
  // removing the last one makes it Manual again. Entered quantities are kept either way.
  const hasAdditionalItem =
    additionalIds.length > 0 || Object.values(drafts).some((draft) => draft?.additionalItem);
  const orderType: CreatableOrderType =
    hasAdditionalItem && canCreateSpecial ? "special" : baseType;
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
  const sheetLines = useMemo(() => {
    if (!worksheet) return [];
    const removed = new Set(removedIds);
    return worksheet.lines.filter((line) => !removed.has(line.modelId));
  }, [removedIds, worksheet]);
  const asideLines = useMemo(
    () => projectWorksheetLines(sheetLines, drafts, orderType, "create"),
    [drafts, orderType, sheetLines],
  );
  const asideTotals = useMemo(
    () => worksheetOrderTotals(asideLines, { includeApproved: false }),
    [asideLines],
  );
  const submitLines = useMemo(() => {
    const quantityByModel = new Map(createDetails.map((line) => [line.modelId, line.quantity]));
    return projectedLines.flatMap((line) => {
      const quantity = quantityByModel.get(line.modelId);
      if (quantity == null || quantity < 1) return [];
      return [{ skuCode: line.skuCode, quantity }];
    });
  }, [createDetails, projectedLines]);
  const submitQuantity = submitLines.reduce((sum, line) => sum + line.quantity, 0);

  const modeOfPayment = modesOfPayment.find((mode) => mode.id === modeOfPaymentId) ?? null;
  const paymentKind = modeOfPayment?.kind ?? null;
  const branch = branches.find((option) => option.id === branchId) ?? null;
  const partyBlock = orderPartyBlock({ kind: paymentKind, dealerId, branch });

  const listHref = listHrefFor(orderType);

  function hasLineEdits(): boolean {
    if (additionalIds.length > 0 || removedIds.length > 0) return true;
    return Object.values(drafts).some((draft) => {
      if (!draft) return false;
      if (draft.additionalItem) return true;
      if ((draft.requestedQty ?? 0) > 0) return true;
      return Boolean(draft.remarks?.trim());
    });
  }

  function resetBranchWorksheet() {
    setWorksheet(null);
    setWorksheetError(null);
    setDrafts({});
    setAdditionalIds([]);
    setRemovedIds([]);
    setAdditionalOpen(false);
  }

  function commitDealer(next: string) {
    setTouched(true);
    setDealerId(next);
    setBranchId("");
    resetBranchWorksheet();
  }

  function commitBranch(next: string) {
    setTouched(true);
    setBranchId(next);
    resetBranchWorksheet();
  }

  function applySetup(choice: BranchOrderSetupChoice) {
    const identityChanged = choice.dealerId !== dealerId || choice.branchId !== branchId;
    setTouched(true);
    setDealerId(choice.dealerId);
    setBranchId(choice.branchId);
    setModeOfPaymentId(choice.modeOfPaymentId);
    if (identityChanged) resetBranchWorksheet();
    setReady(true);
    setSetupOpen(false);
  }

  function requestConfirm(next: PendingConfirm) {
    const needsLineConfirm =
      next.kind === "dealer" ||
      next.kind === "branch" ||
      next.kind === "setup";
    if (needsLineConfirm && !hasLineEdits()) {
      applyConfirm(next);
      return;
    }
    if (next.kind === "leave" && !touched) {
      allowLeave.current = true;
      router.push(next.href);
      return;
    }
    setPendingConfirm(next);
  }

  function applyConfirm(next: PendingConfirm) {
    switch (next.kind) {
      case "dealer":
        commitDealer(next.dealerId);
        return;
      case "branch":
        commitBranch(next.branchId);
        return;
      case "setup":
        applySetup(next.choice);
        return;
      case "leave":
        allowLeave.current = true;
        router.push(next.href);
        return;
      default: {
        const _exhaustive: never = next;
        return _exhaustive;
      }
    }
  }

  useEffect(() => {
    if (!touched) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [touched]);

  useEffect(() => {
    if (!touched) return;
    const onClick = (event: MouseEvent) => {
      if (allowLeave.current || pending) return;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingConfirm({
        kind: "leave",
        href: `${url.pathname}${url.search}${url.hash}`,
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pending, touched]);

  useEffect(() => {
    if (!touched) return;
    const onPop = () => {
      if (allowLeave.current) return;
      const stay = !window.confirm("Leave this page? This order has not been submitted.");
      if (stay) window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [touched]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [dealerRows, modeRows] = await Promise.all([
        listActiveDealersForOrderAction(baseType),
        listModesOfPaymentForOrderAction(baseType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setModesOfPayment(modeRows);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseType]);

  useEffect(() => {
    if (!loaded) return;
    const dealerFilter = branchDealerFilter(paymentKind, dealerId);
    if (dealerFilter === null) return;
    let cancelled = false;
    void listBranchesForOrderAction(dealerFilter || undefined, baseType).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      const current = branchIdRef.current;
      // A dealer's first branch is a safe fallback; for outright another branch would
      // bill another customer, so it is never picked silently.
      const fallback = dealerFilter ? (branchRows[0]?.id ?? "") : "";
      const next = branchRows.some((branch) => branch.id === current) ? current : fallback;
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
  }, [baseType, dealerId, loaded, paymentKind]);

  useEffect(() => {
    let cancelled = false;
    const branch = branchId;
    const ids = additionalKey ? additionalKey.split("\n") : [];
    void (async () => {
      if (!branch) {
        if (!cancelled) {
          setWindowBlock(null);
          setWorksheet(null);
          setWorksheetError(null);
          setLoadingWorksheet(false);
        }
        return;
      }
      setLoadingWorksheet(true);
      setWorksheetError(null);
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
        setWorksheetError(worksheetRes.error ?? "Could not load models for this branch.");
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
    if (!canCreateSpecial || !branchId) return;
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
  }, [branchId, canCreateSpecial]);

  const addableModels = useMemo(() => {
    const onSheet = new Set(sheetLines.map((line) => line.modelId));
    return catalog.filter((model) => !onSheet.has(model.id));
  }, [catalog, sheetLines]);

  function updateDraft(modelId: string, patch: Partial<WorksheetDraftInput>) {
    setTouched(true);
    setDrafts((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? EMPTY_WORKSHEET_DRAFT), ...patch },
    }));
  }

  function addExtraItems(ids: string[]) {
    if (!worksheet || ids.length === 0) return;
    setTouched(true);
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
    setTouched(true);
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
    if (submitStarted.current || pending) return;
    if (!worksheet || createDetails.length === 0) return;
    submitStarted.current = true;
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
        modeOfPaymentId: modeOfPaymentId || null,
        notes: notes.trim() || undefined,
        details: createDetails,
      });
      const waitMs = CREATE_ORDER_MIN_LOADING_MS - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      if (result.error) {
        submitStarted.current = false;
        toast.error(result.error);
        return;
      }
      allowLeave.current = true;
      router.push(`/orders/manual/submitted/${result.orderId}`);
      router.refresh();
    });
  }

  function confirmSubmit() {
    setSubmitOpen(false);
    submit();
  }

  const typeAllowed =
    (orderType === "manual" && canCreateManual) || (orderType === "special" && canCreateSpecial);
  const submitDisabled =
    pending ||
    !typeAllowed ||
    !loaded ||
    partyBlock !== null ||
    windowBlock !== null ||
    loadingWorksheet ||
    !worksheet ||
    createDetails.length === 0;
  const confirm = pendingConfirm ? confirmCopy(pendingConfirm) : null;
  const noteDisabled = pending || !loaded;
  const additionalItemAction = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2 font-medium text-primary hover:bg-primary/10 hover:text-primary"
      disabled={!canCreateSpecial || !worksheet || pending}
      title={
        canCreateSpecial
          ? "Add a model that is not on the shelf plan. The order becomes Special."
          : "You do not have permission to order an extra item."
      }
      onClick={() => setAdditionalOpen(true)}
    >
      Additional item
    </Button>
  );
  const dealerName = dealers.find((dealer) => dealer.id === dealerId)?.name ?? "";
  const branchName = branch?.name ?? "";
  const paymentName = modeOfPayment
    ? `${modeOfPayment.name}${paymentKind ? ` (${MODE_OF_PAYMENT_KIND_LABELS[paymentKind]})` : ""}`
    : "";
  // Consignment names the dealer; outright names the SAP customer the SO bills.
  const party =
    paymentKind === "OUTRIGHT"
      ? { label: "BP Code (SAP customer)", value: branch?.bpCode ?? "Not set" }
      : { label: "Dealer", value: dealerName || "—" };

  function continueSetup(choice: OrderSetupChoice) {
    if (choice.orderFor === "service_center") {
      // A service-center order is its own page; leaving this one may drop entered lines.
      setSetupOpen(false);
      requestConfirm({ kind: "leave", href: orderSetupHref(choice) });
      return;
    }
    const identityChanged = choice.dealerId !== dealerId || choice.branchId !== branchId;
    if (ready && identityChanged) {
      setSetupOpen(false);
      requestConfirm({ kind: "setup", choice });
      return;
    }
    applySetup(choice);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-xl bg-sidebar px-5 py-5 text-sidebar-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Create Order</h1>
          <p className="mt-1 text-sm text-sidebar-muted">
            Add quantities for this branch, then submit when you are ready.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-full bg-sidebar-accent px-3.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
            disabled={pending}
            onClick={() => requestConfirm({ kind: "leave", href: listHref })}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Back to orders
          </button>
          <Button type="button" disabled={submitDisabled} onClick={() => setSubmitOpen(true)}>
            Submit
          </Button>
        </div>
      </header>
      {ready ? (
        <div className="rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="space-y-8 p-5 sm:p-6">
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">Order</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Payment, branch, and who SAP bills for this order.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setSetupOpen(true)}
                >
                  Change
                </Button>
              </div>
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <OrderReadout label="Mode of payment" value={paymentName || "Not set"} />
                <div className="min-w-0">
                  <OrderReadout label="Order type" value={BRANCH_ORDER_TYPE_LABELS[orderType]} />
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Set automatically. Adding an item that is not on the shelf plan makes it
                    Special.
                  </p>
                </div>
                <OrderReadout label={party.label} value={party.value} />
                <OrderReadout label="Branch" value={branchName || "—"} />
                <div className="min-w-0 sm:col-span-2">
                  <label htmlFor="create-order-note" className="text-sm text-muted-foreground">
                    Note for this order
                  </label>
                  <Textarea
                    id="create-order-note"
                    value={notes}
                    onChange={(event) => {
                      setTouched(true);
                      setNotes(event.target.value);
                    }}
                    placeholder="Optional"
                    rows={3}
                    className="mt-1.5 min-h-24 resize-none rounded-lg border-transparent bg-muted/70 shadow-none"
                    aria-label="Note for this order"
                    disabled={noteDisabled}
                  />
                </div>
              </div>
              {loaded && branches.length > 0 && partyBlock ? (
                <p className={ORDER_PARTY_BLOCK_CLASS}>{partyBlock}</p>
              ) : null}
              {windowBlock ? <p className={ORDER_PARTY_BLOCK_CLASS}>{windowBlock}</p> : null}
            </section>
            <section className="space-y-4 border-t border-border/70 pt-8">
              <div>
                <h2 className="text-base font-semibold text-foreground">Models</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Search the list and enter a quantity on each model you want.
                </p>
              </div>
              {orderType === "special" ? (
                <p className={SPECIAL_ORDER_NOTICE_CLASS}>{SPECIAL_ORDER_NOTICE}</p>
              ) : null}
              <OrderWorksheet
                lines={sheetLines}
                brands={worksheet?.brands ?? []}
                drafts={drafts}
                mode="create"
                orderType={orderType}
                loading={loadingWorksheet}
                error={worksheetError}
                summary={worksheet?.summary ?? null}
                summaryMode="current"
                hideSummary
                filterAction={additionalItemAction}
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
              />
              <div className="border-t border-border/70 pt-5">
                <OrderWorksheetAsideSummary
                  summary={worksheet?.summary ?? null}
                  totals={asideTotals}
                  loading={loadingWorksheet || (!worksheet && !worksheetError)}
                />
              </div>
            </section>
          </div>
        </div>
      ) : null}
      <CreateOrderSetupDialog
        open={setupOpen}
        canCreateManual={canCreateManual}
        canCreateSpecial={canCreateSpecial}
        canCreateServiceCenter={canCreateServiceCenter}
        initialDealerId={ready ? dealerId : (prefill?.dealerId ?? "")}
        initialBranchId={ready ? branchId : (prefill?.branchId ?? "")}
        initialModeOfPaymentId={ready ? modeOfPaymentId : initialModeOfPaymentId}
        onOpenChange={(open) => {
          if (open) {
            setSetupOpen(true);
            return;
          }
          if (!ready) {
            allowLeave.current = true;
            router.push(listHref);
            return;
          }
          setSetupOpen(false);
        }}
        onContinue={continueSetup}
      />
      {additionalOpen ? (
        <AdditionalItemDialog
          open
          models={addableModels}
          onOpenChange={setAdditionalOpen}
          onAdd={addExtraItems}
        />
      ) : null}
      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingConfirm) return;
                const next = pendingConfirm;
                setPendingConfirm(null);
                applyConfirm(next);
              }}
            >
              {confirm?.action ?? "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={submitOpen}
        onOpenChange={(open) => {
          if (!pending) setSubmitOpen(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit this order?</DialogTitle>
            <DialogDescription>Are you sure you want to submit this order?</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Order type</dt>
            <dd className="min-w-0 break-words font-medium">{BRANCH_ORDER_TYPE_LABELS[orderType]}</dd>
            <dt className="text-muted-foreground">{party.label}</dt>
            <dd className="min-w-0 break-words font-medium">{party.value}</dd>
            <dt className="text-muted-foreground">Branch</dt>
            <dd className="min-w-0 break-words font-medium">{branchName || "—"}</dd>
            <dt className="text-muted-foreground">Mode of payment</dt>
            <dd className="min-w-0 break-words font-medium">{paymentName || "Not set"}</dd>
            <dt className="text-muted-foreground">Models with a quantity</dt>
            <dd className="font-medium tabular-nums">{submitLines.length.toLocaleString()}</dd>
            <dt className="text-muted-foreground">Total quantity</dt>
            <dd className="font-medium tabular-nums">{submitQuantity.toLocaleString()}</dd>
            {worksheet ? (
              <>
                <dt className="text-muted-foreground">Requested value</dt>
                <dd className="font-medium tabular-nums">{formatPeso(asideTotals.requestedAmount)}</dd>
                <dt className="text-muted-foreground">Total CBM</dt>
                <dd className="font-medium tabular-nums">
                  {formatWorksheetCbm(asideTotals.requestedCbm)}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Models</p>
            {submitLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No models with a quantity yet.</p>
            ) : (
              <ul className="max-h-40 divide-y divide-border/60 overflow-y-auto text-sm">
                {submitLines.slice(0, SUBMIT_PREVIEW_LIMIT).map((line) => (
                  <li key={line.skuCode} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate font-medium">{line.skuCode}</span>
                    <span className="shrink-0 tabular-nums">{line.quantity.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
            {submitLines.length > SUBMIT_PREVIEW_LIMIT ? (
              <p className="text-sm text-muted-foreground">
                and {(submitLines.length - SUBMIT_PREVIEW_LIMIT).toLocaleString()} more
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setSubmitOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={pending || submitDisabled} onClick={confirmSubmit}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoadingModal
        open={pending}
        variant="minimal"
        title="Processing order"
        description="Please wait while we process the order."
      />
    </div>
  );
}

export function CreateOrderSetupDialog({
  open,
  canCreateManual,
  canCreateSpecial,
  canCreateServiceCenter = false,
  initialOrderFor = "branch",
  initialDealerId = "",
  initialBranchId = "",
  initialModeOfPaymentId = "",
  initialServiceCenterId = "",
  initialCardCode = "",
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  canCreateManual: boolean;
  canCreateSpecial: boolean;
  canCreateServiceCenter?: boolean;
  initialOrderFor?: OrderFor;
  initialDealerId?: string;
  initialBranchId?: string;
  initialModeOfPaymentId?: string;
  initialServiceCenterId?: string;
  initialCardCode?: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (choice: OrderSetupChoice) => void;
}) {
  const wasOpen = useRef(false);
  const forOptions = useMemo(() => {
    const options: OrderFor[] = [];
    if (canCreateManual || canCreateSpecial) options.push("branch");
    if (canCreateServiceCenter) options.push("service_center");
    return options;
  }, [canCreateManual, canCreateServiceCenter, canCreateSpecial]);
  const [orderFor, setOrderFor] = useState<OrderFor>(initialOrderFor);
  const [draftServiceCenterId, setDraftServiceCenterId] = useState(initialServiceCenterId);
  const [draftCardCode, setDraftCardCode] = useState(initialCardCode);
  const isBranch = orderFor === "branch";
  const sc = useScOrderSetup(open && orderFor === "service_center");
  // The order type is decided on the order page from its lines; lookups only need a type
  // the user may create, for their permission checks.
  const draftType: CreatableOrderType = canCreateManual ? "manual" : "special";
  const [draftDealerId, setDraftDealerId] = useState(initialDealerId);
  const [draftBranchId, setDraftBranchId] = useState(initialBranchId);
  const [draftPaymentId, setDraftPaymentId] = useState(initialModeOfPaymentId);
  const [dealers, setDealers] = useState<OrderDealerOption[]>([]);
  const [branches, setBranches] = useState<OrderBranchOption[]>([]);
  const [modesOfPayment, setModesOfPayment] = useState<OrderModeOfPaymentOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const branchIdRef = useRef(draftBranchId);

  const paymentKind = modesOfPayment.find((mode) => mode.id === draftPaymentId)?.kind ?? null;

  useEffect(() => {
    branchIdRef.current = draftBranchId;
  }, [draftBranchId]);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setOrderFor(forOptions.includes(initialOrderFor) ? initialOrderFor : (forOptions[0] ?? "branch"));
    setDraftDealerId(initialDealerId);
    setDraftBranchId(initialBranchId);
    setDraftPaymentId(initialModeOfPaymentId);
    setDraftServiceCenterId(initialServiceCenterId);
    setDraftCardCode(initialCardCode);
    setLoaded(false);
  }, [
    forOptions,
    initialBranchId,
    initialCardCode,
    initialDealerId,
    initialModeOfPaymentId,
    initialOrderFor,
    initialServiceCenterId,
    open,
  ]);

  useEffect(() => {
    if (!open || !isBranch) return;
    let cancelled = false;
    void (async () => {
      const [dealerRows, modeRows] = await Promise.all([
        listActiveDealersForOrderAction(draftType),
        listModesOfPaymentForOrderAction(draftType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setModesOfPayment(modeRows);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftType, isBranch, open]);

  // Consignment lists the dealer's branches; outright lists every branch (no dealer).
  useEffect(() => {
    if (!open || !loaded) return;
    const dealerFilter = branchDealerFilter(paymentKind, draftDealerId);
    if (dealerFilter === null) return;
    let cancelled = false;
    void listBranchesForOrderAction(dealerFilter || undefined, draftType).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      if (!branchRows.some((branch) => branch.id === branchIdRef.current)) {
        setDraftBranchId("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftDealerId, draftType, loaded, open, paymentKind]);

  // Rows from an earlier mode of payment or dealer never show while the next list loads.
  const branchOptions = branchDealerFilter(paymentKind, draftDealerId) === null ? [] : branches;
  const branch = branchOptions.find((option) => option.id === draftBranchId) ?? null;
  const partyBlock = orderPartyBlock({ kind: paymentKind, dealerId: draftDealerId, branch });
  const typeAllowed = canCreateManual || canCreateSpecial;
  const scPrimary = sc.setup?.customers.find((customer) => customer.isPrimary)?.cardCode ?? "";
  const scCardCode = draftCardCode || scPrimary;
  const canContinue = isBranch
    ? loaded && typeAllowed && partyBlock === null
    : sc.loaded && scOrderSetupBlock(sc.setup) === null && Boolean(draftServiceCenterId && scCardCode);

  function continueWithChoice() {
    if (isBranch) {
      onContinue({
        orderFor: "branch",
        dealerId: paymentKind === "CONSIGNMENT" ? draftDealerId : "",
        branchId: draftBranchId,
        modeOfPaymentId: draftPaymentId,
      });
      return;
    }
    onContinue({
      orderFor: "service_center",
      serviceCenterId: draftServiceCenterId,
      cardCode: scCardCode,
    });
  }

  function changePayment(next: string) {
    if (next === draftPaymentId) return;
    const nextKind = modesOfPayment.find((mode) => mode.id === next)?.kind ?? null;
    setDraftPaymentId(next);
    if (nextKind === paymentKind) return;
    // Outright has no dealer; the branch stays only if the new list still has it.
    if (nextKind !== "CONSIGNMENT") setDraftDealerId("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create order</DialogTitle>
          <DialogDescription>
            {isBranch
              ? "Choose the mode of payment, then where the order goes."
              : "Choose the service center and the SAP customer the Sales Order bills."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {forOptions.length > 1 ? (
            <div className="space-y-2">
              <p className="text-sm font-normal text-muted-foreground">Order for</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Order for">
                {forOptions.map((option) => {
                  const selected = option === orderFor;
                  return (
                    <Button
                      key={option}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setOrderFor(option)}
                    >
                      {ORDER_FOR_LABELS[option]}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {!isBranch ? (
            sc.setup ? (
              <ServiceCenterSetupFields
                centers={sc.centers}
                setup={sc.setup}
                serviceCenterId={draftServiceCenterId}
                cardCode={draftCardCode}
                onServiceCenterChange={setDraftServiceCenterId}
                onCardCodeChange={setDraftCardCode}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading service centers…</p>
            )
          ) : null}
          {!isBranch ? null : !loaded ? (
            <p className="text-sm text-muted-foreground">Loading modes of payment…</p>
          ) : (
            <>
              <SearchableSelect
                label="Mode of payment"
                className="w-full"
                options={modesOfPayment.map((mode) => ({
                  id: mode.id,
                  label: mode.name,
                  description: mode.kind ? MODE_OF_PAYMENT_KIND_LABELS[mode.kind] : undefined,
                }))}
                value={draftPaymentId}
                onChange={changePayment}
                placeholder="Select mode of payment…"
                searchPlaceholder="Search modes of payment…"
                emptyMessage="No mode of payment has a type yet. Set one in Settings, Master data."
              />
              {paymentKind === "CONSIGNMENT" ? (
                dealers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No dealers are available for this order.
                  </p>
                ) : (
                  <SearchableSelect
                    label="Dealer"
                    className="w-full"
                    options={dealers.map((dealer) => ({ id: dealer.id, label: dealer.name }))}
                    value={draftDealerId}
                    onChange={(next) => {
                      if (next === draftDealerId) return;
                      setDraftDealerId(next);
                      setDraftBranchId("");
                      setBranches([]);
                    }}
                    allowClear
                    placeholder="Select dealer…"
                    searchPlaceholder="Search dealers…"
                  />
                )
              ) : null}
              {paymentKind ? (
                <SearchableSelect
                  label="Branch"
                  className="w-full"
                  options={branchOptions.map((option) => ({
                    id: option.id,
                    label: option.name,
                    description: option.sapCode,
                  }))}
                  value={draftBranchId}
                  onChange={setDraftBranchId}
                  placeholder={
                    paymentKind === "CONSIGNMENT" && !draftDealerId
                      ? "Select a dealer first…"
                      : "Select branch…"
                  }
                  searchPlaceholder="Search branches…"
                  disabled={paymentKind === "CONSIGNMENT" && !draftDealerId}
                  emptyMessage={
                    paymentKind === "CONSIGNMENT"
                      ? "No active branches for this dealer."
                      : "No active branches."
                  }
                />
              ) : null}
              {paymentKind === "OUTRIGHT" && branch ? (
                branch.bpCode ? (
                  <OrderReadout label="BP Code (SAP customer)" value={branch.bpCode} />
                ) : (
                  <p className={ORDER_PARTY_BLOCK_CLASS}>{partyBlock}</p>
                )
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canContinue} onClick={continueWithChoice}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
