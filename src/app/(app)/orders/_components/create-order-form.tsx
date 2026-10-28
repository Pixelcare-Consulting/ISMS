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

const SPECIAL_ORDER_NOTICE =
  "This is a special order. You can add models that are not on the shelf plan. Supply Planning still approves it.";

type CreatableOrderType = "manual" | "special";

interface SpecialModelOption {
  id: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
}

export interface OrderSetupChoice {
  dealerId: string;
  branchId: string;
  orderType: CreatableOrderType;
  /** Resolved mode for this order. Empty when the dealer has no default and none was picked. */
  modeOfPaymentId: string;
}

type PendingConfirm =
  | { kind: "dealer"; dealerId: string }
  | { kind: "branch"; branchId: string }
  | { kind: "type"; orderType: CreatableOrderType }
  | { kind: "setup"; choice: OrderSetupChoice }
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
    case "type":
    case "setup":
      return {
        title: "Clear the lines on this order?",
        description:
          "Changing the dealer, branch, or order type clears quantities and extra items. The note for this order stays.",
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
  initialType,
  canCreateManual,
  canCreateSpecial,
  prefill,
  initialReady = false,
  initialModeOfPaymentId = "",
}: {
  initialType: CreatableOrderType;
  canCreateManual: boolean;
  canCreateSpecial: boolean;
  prefill?: CreateOrderPrefill;
  /** Set after the setup popup's Continue. A direct visit stays in the popup. */
  initialReady?: boolean;
  initialModeOfPaymentId?: string;
}) {
  const router = useRouter();
  const allowLeave = useRef(false);
  const submitStarted = useRef(false);
  const startReady = Boolean(initialReady && prefill?.dealerId && prefill?.branchId);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(startReady);
  const [setupOpen, setSetupOpen] = useState(!startReady);
  const [orderType, setOrderType] = useState<CreatableOrderType>(initialType);
  const [touched, setTouched] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [dealers, setDealers] = useState<
    { id: string; name: string; modeOfPaymentId: string | null }[]
  >([]);
  const [modesOfPayment, setModesOfPayment] = useState<
    { id: string; name: string; kind: "CONSIGNMENT" | "OUTRIGHT" | null }[]
  >([]);
  const [modeOfPaymentChoice, setModeOfPaymentChoice] = useState(
    startReady ? initialModeOfPaymentId : "",
  );
  const [branches, setBranches] = useState<
    { id: string; name: string; dealerId: string | null }[]
  >([]);
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

  const dealerModeOfPaymentId =
    dealers.find((dealer) => dealer.id === dealerId)?.modeOfPaymentId ?? null;
  const dealerModeOfPayment =
    modesOfPayment.find((mode) => mode.id === dealerModeOfPaymentId) ?? null;
  const selectedModeOfPaymentId = modeOfPaymentChoice || dealerModeOfPayment?.id || "";
  const isModeOfPaymentOverride =
    Boolean(selectedModeOfPaymentId) && selectedModeOfPaymentId !== dealerModeOfPayment?.id;
  const modeOfPaymentHint = isModeOfPaymentOverride
    ? `Override for this order only. The dealer's default is ${dealerModeOfPayment?.name ?? "not set"}.`
    : dealerModeOfPayment
      ? "The dealer's default. Change it to use another mode of payment for this order only."
      : "This dealer has no mode of payment with a type. Pick one for this order.";

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
    setModeOfPaymentChoice("");
    setBranchId("");
    resetBranchWorksheet();
  }

  function commitBranch(next: string) {
    setTouched(true);
    setBranchId(next);
    resetBranchWorksheet();
  }

  function commitType(next: CreatableOrderType) {
    setTouched(true);
    setOrderType(next);
    resetBranchWorksheet();
  }

  function applySetup(choice: OrderSetupChoice) {
    const identityChanged =
      choice.dealerId !== dealerId ||
      choice.branchId !== branchId ||
      choice.orderType !== orderType;
    setTouched(true);
    setOrderType(choice.orderType);
    setDealerId(choice.dealerId);
    setBranchId(choice.branchId);
    setModeOfPaymentChoice(choice.modeOfPaymentId);
    if (identityChanged) resetBranchWorksheet();
    setReady(true);
    setSetupOpen(false);
  }

  function requestConfirm(next: PendingConfirm) {
    const needsLineConfirm =
      next.kind === "dealer" ||
      next.kind === "branch" ||
      next.kind === "type" ||
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
      case "type":
        commitType(next.orderType);
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
      const [dealerRows, branchRows, modeRows] = await Promise.all([
        listActiveDealersForOrderAction(orderType),
        listBranchesForOrderAction(prefill?.dealerId || undefined, orderType),
        listModesOfPaymentForOrderAction(orderType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setModesOfPayment(modeRows);
      if (!dealerId) {
        setBranches(branchRows);
        if (prefill?.branchId && !prefill.dealerId) {
          const match = branchRows.find((branch) => branch.id === prefill.branchId);
          if (match?.dealerId) setDealerId(match.dealerId);
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealerId, orderType, prefill?.branchId, prefill?.dealerId]);

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
        modeOfPaymentId: selectedModeOfPaymentId || null,
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
    !dealerId ||
    !branchId ||
    windowBlock !== null ||
    loadingWorksheet ||
    !worksheet ||
    createDetails.length === 0;
  const confirm = pendingConfirm ? confirmCopy(pendingConfirm) : null;
  const noteDisabled = pending || !loaded || dealers.length === 0;
  const additionalItemAction =
    orderType === "special" ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 font-medium text-primary hover:bg-primary/10 hover:text-primary"
        disabled={!worksheet || pending}
        onClick={() => setAdditionalOpen(true)}
      >
        Additional item
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 font-medium text-primary hover:bg-primary/10 hover:text-primary"
        disabled={!canCreateSpecial || !branchId || pending}
        title={
          canCreateSpecial
            ? "Switches this order to Special so you can add a model that is not on the shelf plan."
            : "You do not have permission to order an extra item."
        }
        onClick={() => requestConfirm({ kind: "type", orderType: "special" })}
      >
        Additional item
      </Button>
    );
  const dealerName = dealers.find((dealer) => dealer.id === dealerId)?.name ?? "";
  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "";
  const paymentName =
    modesOfPayment.find((mode) => mode.id === selectedModeOfPaymentId)?.name ?? "";

  function continueSetup(choice: OrderSetupChoice) {
    const identityChanged =
      choice.dealerId !== dealerId ||
      choice.branchId !== branchId ||
      choice.orderType !== orderType;
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
                    Dealer, branch, and payment for this order.
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
                <OrderReadout label="Dealer" value={dealerName || "—"} />
                <OrderReadout label="Branch" value={branchName || "—"} />
                <div className="min-w-0">
                  <OrderReadout label="Mode of payment" value={paymentName || "Not set"} />
                  {dealerId ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {modeOfPaymentHint}
                    </p>
                  ) : null}
                </div>
                <OrderReadout label="Order type" value={BRANCH_ORDER_TYPE_LABELS[orderType]} />
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
              {windowBlock ? (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {windowBlock}
                </p>
              ) : null}
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
        initialType={orderType}
        initialDealerId={ready ? dealerId : (prefill?.dealerId ?? "")}
        initialBranchId={ready ? branchId : (prefill?.branchId ?? "")}
        initialModeOfPaymentId={ready ? selectedModeOfPaymentId : initialModeOfPaymentId}
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
      {orderType === "special" && additionalOpen ? (
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
            <dt className="text-muted-foreground">Dealer</dt>
            <dd className="min-w-0 break-words font-medium">{dealerName || "—"}</dd>
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
  initialType,
  initialDealerId = "",
  initialBranchId = "",
  initialModeOfPaymentId = "",
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  canCreateManual: boolean;
  canCreateSpecial: boolean;
  initialType: CreatableOrderType;
  initialDealerId?: string;
  initialBranchId?: string;
  initialModeOfPaymentId?: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (choice: OrderSetupChoice) => void;
}) {
  const wasOpen = useRef(false);
  const [draftType, setDraftType] = useState<CreatableOrderType>(initialType);
  const [draftDealerId, setDraftDealerId] = useState(initialDealerId);
  const [draftBranchId, setDraftBranchId] = useState(initialBranchId);
  const [draftPaymentId, setDraftPaymentId] = useState(initialModeOfPaymentId);
  const [dealers, setDealers] = useState<
    { id: string; name: string; modeOfPaymentId: string | null }[]
  >([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [modesOfPayment, setModesOfPayment] = useState<
    { id: string; name: string; kind: "CONSIGNMENT" | "OUTRIGHT" | null }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const branchIdRef = useRef(draftBranchId);
  const dealerIdRef = useRef(draftDealerId);

  const typeOptions = useMemo(() => {
    const options: CreatableOrderType[] = [];
    if (canCreateManual) options.push("manual");
    if (canCreateSpecial) options.push("special");
    return options;
  }, [canCreateManual, canCreateSpecial]);

  useEffect(() => {
    branchIdRef.current = draftBranchId;
    dealerIdRef.current = draftDealerId;
  }, [draftBranchId, draftDealerId]);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    const nextType = typeOptions.includes(initialType)
      ? initialType
      : (typeOptions[0] ?? initialType);
    setDraftType(nextType);
    setDraftDealerId(initialDealerId);
    setDraftBranchId(initialBranchId);
    setDraftPaymentId(initialModeOfPaymentId);
    setLoaded(false);
  }, [initialBranchId, initialDealerId, initialModeOfPaymentId, initialType, open, typeOptions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [dealerRows, modeRows] = await Promise.all([
        listActiveDealersForOrderAction(draftType),
        listModesOfPaymentForOrderAction(draftType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setModesOfPayment(modeRows);
      if (!dealerRows.some((dealer) => dealer.id === dealerIdRef.current)) {
        setDraftDealerId("");
        setDraftBranchId("");
        setBranches([]);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftType, open]);

  useEffect(() => {
    if (!open || !loaded || !draftDealerId) return;
    let cancelled = false;
    void listBranchesForOrderAction(draftDealerId, draftType).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      const current = branchIdRef.current;
      if (!branchRows.some((branch) => branch.id === current)) {
        setDraftBranchId("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftDealerId, draftType, loaded, open]);

  const dealerDefault =
    modesOfPayment.find(
      (mode) => mode.id === dealers.find((dealer) => dealer.id === draftDealerId)?.modeOfPaymentId,
    ) ?? null;
  const selectedPaymentId = draftPaymentId || dealerDefault?.id || "";
  const paymentIsOverride =
    Boolean(selectedPaymentId) && selectedPaymentId !== dealerDefault?.id;
  const paymentHint = paymentIsOverride
    ? `Override for this order only. The dealer's default is ${dealerDefault?.name ?? "not set"}.`
    : dealerDefault
      ? "The dealer's default. Change it to use another mode of payment for this order only."
      : "This dealer has no mode of payment with a type. Pick one for this order.";
  const typeAllowed =
    (draftType === "manual" && canCreateManual) || (draftType === "special" && canCreateSpecial);
  const canContinue = loaded && typeAllowed && Boolean(draftDealerId) && Boolean(draftBranchId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create order</DialogTitle>
          <DialogDescription>
            Choose the dealer, branch, and order type for this order.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-normal text-muted-foreground">Order type</p>
            {typeOptions.length > 1 ? (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Order type">
                {typeOptions.map((option) => {
                  const selected = option === draftType;
                  return (
                    <Button
                      key={option}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        if (option === draftType) return;
                        setDraftType(option);
                        setDraftPaymentId("");
                      }}
                    >
                      {BRANCH_ORDER_TYPE_LABELS[option]}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm font-medium">{BRANCH_ORDER_TYPE_LABELS[draftType]}</p>
            )}
          </div>
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading dealers and branches…</p>
          ) : dealers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dealers are available for this order.
            </p>
          ) : (
            <>
              <SearchableSelect
                label="Dealer"
                className="w-full"
                options={dealers.map((dealer) => ({ id: dealer.id, label: dealer.name }))}
                value={draftDealerId}
                onChange={(next) => {
                  if (next === draftDealerId) return;
                  setDraftDealerId(next);
                  setDraftBranchId("");
                  setDraftPaymentId("");
                  setBranches([]);
                }}
                allowClear
                placeholder="Select dealer…"
                searchPlaceholder="Search dealers…"
              />
              <SearchableSelect
                label="Branch"
                className="w-full"
                options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
                value={draftBranchId}
                onChange={setDraftBranchId}
                placeholder={draftDealerId ? "Select branch…" : "Select a dealer first…"}
                searchPlaceholder="Search branches…"
                disabled={!draftDealerId}
                emptyMessage="No active branches for this dealer."
              />
              <div className="space-y-2">
                <SearchableSelect
                  label="Mode of payment"
                  className="w-full"
                  options={modesOfPayment.map((mode) => ({
                    id: mode.id,
                    label: mode.name,
                    description: mode.kind ? MODE_OF_PAYMENT_KIND_LABELS[mode.kind] : undefined,
                  }))}
                  value={selectedPaymentId}
                  onChange={setDraftPaymentId}
                  placeholder={draftDealerId ? "Select mode of payment…" : "Select a dealer first…"}
                  searchPlaceholder="Search modes of payment…"
                  disabled={!draftDealerId}
                  emptyMessage="No mode of payment has a type yet. Set one in Settings, Master data."
                />
                {draftDealerId ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">{paymentHint}</p>
                ) : null}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canContinue}
            onClick={() =>
              onContinue({
                dealerId: draftDealerId,
                branchId: draftBranchId,
                orderType: draftType,
                modeOfPaymentId: selectedPaymentId,
              })
            }
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
