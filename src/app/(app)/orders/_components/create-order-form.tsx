"use client";

import { ChevronLeft, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AdditionalItemDialog } from "@/app/(app)/orders/_components/additional-item-dialog";
import {
  OrderWorksheet,
  OrderWorksheetAsideSummary,
} from "@/app/(app)/orders/_components/order-worksheet";
import type { CreateOrderPrefill } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import type { OrderSetupChoice } from "@/app/(app)/orders/_components/order-setup";
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
import { Input } from "@/components/ui/input";
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
  findOpenBranchBrandOrderAction,
  listActiveDealersForOrderAction,
  listBranchesForOrderAction,
  listModesOfPaymentForOrderAction,
  uploadCreateOrderAttachmentsAction,
} from "@/features/orders/actions/order.actions";
import { SALE_PROOF_MAX_FILES } from "@/features/sales/utils/sale-proof";
import {
  getOrderWorksheetAction,
  listSpecialOrderModelsAction,
} from "@/features/orders/actions/order-worksheet.actions";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { buildOrderCreateDetails } from "@/features/orders/lib/order-create-details";
import {
  branchDealer,
  defaultModeOfPaymentId,
  orderPartyBlock,
  type OrderBranchOption,
  type OrderDealerOption,
  type OrderModeOfPaymentOption,
} from "@/features/orders/lib/order-party";
import { worksheetFiguresForBrand } from "@/features/orders/lib/order-worksheet";
import {
  defaultCreateOrderBrandId,
  planogramBrandOptions,
  worksheetOrderTotals,
} from "@/features/orders/lib/order-worksheet-filters";
import {
  isOpenBranchBrandOrderMessage,
  OPEN_BRANCH_BRAND_ORDER_TITLE,
  openBranchBrandOrderMessage,
} from "@/features/orders/lib/open-branch-brand-order";
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

/** Result of the open-order lookup for one branch, brand, and base type. */
interface OpenOrderLookup {
  branchId: string;
  brandId: string;
  orderType: CreatableOrderType;
  message: string | null;
}

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

interface CreateOrderAttachment {
  path: string;
  name: string;
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
          "Changing the dealer or branch clears quantities and extra items. The note and attachments for this order stay.",
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
  prefill,
  initialReady = false,
  initialModeOfPaymentId = "",
}: {
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
  const [attachments, setAttachments] = useState<CreateOrderAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [worksheet, setWorksheet] = useState<OrderWorksheetPayload | null>(null);
  const [worksheetError, setWorksheetError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, WorksheetDraftInput>>({});
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [brandId, setBrandId] = useState("");
  const [openOrderLookup, setOpenOrderLookup] = useState<OpenOrderLookup | null>(null);
  const [openOrderDialogOpen, setOpenOrderDialogOpen] = useState(false);
  const [windowBlock, setWindowBlock] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SpecialModelOption[]>([]);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [loadingWorksheet, setLoadingWorksheet] = useState(false);
  const additionalKey = additionalIds.join("\n");
  /** Manual unless the user may only create special orders. Lookups use it for permissions. */
  const baseType: CreatableOrderType = canCreateManual ? "manual" : "special";
  const sheetLines = useMemo(() => {
    if (!worksheet) return [];
    const removed = new Set(removedIds);
    return worksheet.lines.filter((line) => !removed.has(line.modelId));
  }, [removedIds, worksheet]);
  // One brand. Devant when this branch has it; otherwise the first planogram brand.
  const activeBrandId = useMemo(() => {
    if (!worksheet) return "";
    const options = planogramBrandOptions(worksheet.brands, sheetLines);
    if (options.some((brand) => brand.id === brandId)) return brandId;
    return defaultCreateOrderBrandId(options);
  }, [brandId, sheetLines, worksheet]);
  // Idle when branch or brand is missing: nothing to look up, so this is not a check
  // and it does not keep a previous selection's dialog on screen.
  const openOrderLookupCurrent =
    openOrderLookup !== null &&
    openOrderLookup.branchId === branchId &&
    openOrderLookup.brandId === activeBrandId &&
    openOrderLookup.orderType === baseType
      ? openOrderLookup
      : null;
  const checkingOpenOrder = Boolean(branchId && activeBrandId) && openOrderLookupCurrent === null;
  const openOrderMessage = openOrderLookupCurrent?.message ?? null;
  const brandByModelId = useMemo(() => {
    const brands = new Map<string, string | null>();
    for (const line of worksheet?.lines ?? []) brands.set(line.modelId, line.brandId);
    for (const model of catalog) {
      if (!brands.has(model.id)) brands.set(model.id, model.brandId);
    }
    return brands;
  }, [catalog, worksheet]);
  // An off-plan item of the selected brand makes the order Special. Other brands do not.
  const hasAdditionalItem = useMemo(() => {
    if (!activeBrandId) return false;
    const ids = new Set(additionalIds);
    for (const [modelId, draft] of Object.entries(drafts)) {
      if (draft?.additionalItem) ids.add(modelId);
    }
    for (const modelId of ids) {
      if (brandByModelId.get(modelId) === activeBrandId) return true;
    }
    return false;
  }, [activeBrandId, additionalIds, brandByModelId, drafts]);
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
  const brandProjectedLines = useMemo(
    () =>
      activeBrandId ? projectedLines.filter((line) => line.brandId === activeBrandId) : [],
    [activeBrandId, projectedLines],
  );
  const createDetails = useMemo(
    () => buildOrderCreateDetails(brandProjectedLines, new Set(removedIds)),
    [brandProjectedLines, removedIds],
  );
  // Removed models stay in this list so their stock still counts for the selected brand.
  const planningFigures = useMemo(() => {
    if (!worksheet || !activeBrandId) return null;
    return worksheetFiguresForBrand({
      lines: brandProjectedLines,
      brandId: activeBrandId,
      brandQuotas: worksheet.brandQuotas,
      daysElapsed: worksheet.summary.daysElapsed,
    });
  }, [activeBrandId, brandProjectedLines, worksheet]);
  const asideLines = useMemo(() => {
    const lines = activeBrandId
      ? sheetLines.filter((line) => line.brandId === activeBrandId)
      : [];
    return projectWorksheetLines(lines, drafts, orderType, "create");
  }, [activeBrandId, drafts, orderType, sheetLines]);
  const asideTotals = useMemo(
    () => worksheetOrderTotals(asideLines, { includeApproved: false }),
    [asideLines],
  );
  const submitLines = useMemo(() => {
    const quantityByModel = new Map(createDetails.map((line) => [line.modelId, line.quantity]));
    return brandProjectedLines.flatMap((line) => {
      const quantity = quantityByModel.get(line.modelId);
      if (quantity == null || quantity < 1) return [];
      return [{ skuCode: line.skuCode, quantity }];
    });
  }, [brandProjectedLines, createDetails]);
  const submitQuantity = submitLines.reduce((sum, line) => sum + line.quantity, 0);

  const modeOfPayment = modesOfPayment.find((mode) => mode.id === modeOfPaymentId) ?? null;
  const paymentKind = modeOfPayment?.kind ?? null;
  const branch = branches.find((option) => option.id === branchId) ?? null;
  const partyBlock = orderPartyBlock({ kind: paymentKind, branch });

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
    setBrandId("");
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

  function applySetup(choice: OrderSetupChoice) {
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
      const [dealerRows, modeRows, branchRows] = await Promise.all([
        listActiveDealersForOrderAction(baseType),
        listModesOfPaymentForOrderAction(baseType),
        listBranchesForOrderAction(undefined, baseType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setModesOfPayment(modeRows);
      setBranches(branchRows);
      // A linked branch outside the user's list is dropped, never swapped for another one.
      if (branchIdRef.current && !branchRows.some((row) => row.id === branchIdRef.current)) {
        setDrafts({});
        setAdditionalIds([]);
        setWorksheet(null);
        setBranchId("");
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseType]);

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

  useEffect(() => {
    if (!branchId || !activeBrandId) return;
    let cancelled = false;
    const requestedBranchId = branchId;
    const requestedBrandId = activeBrandId;
    const requestedOrderType = baseType;
    void findOpenBranchBrandOrderAction({
      branchId: requestedBranchId,
      brandId: requestedBrandId,
      orderType: requestedOrderType,
    }).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        toast.error(result.error);
        setOpenOrderLookup({
          branchId: requestedBranchId,
          brandId: requestedBrandId,
          orderType: requestedOrderType,
          message: null,
        });
        return;
      }
      const message = result.order ? openBranchBrandOrderMessage(result.order) : null;
      setOpenOrderLookup({
        branchId: requestedBranchId,
        brandId: requestedBrandId,
        orderType: requestedOrderType,
        message,
      });
      if (message) setOpenOrderDialogOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, baseType, branchId]);

  const addableModels = useMemo(() => {
    if (!activeBrandId) return [];
    const onSheet = new Set(sheetLines.map((line) => line.modelId));
    return catalog.filter(
      (model) => !onSheet.has(model.id) && model.brandId === activeBrandId,
    );
  }, [activeBrandId, catalog, sheetLines]);

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

  async function onAttachmentsSelected(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = SALE_PROOF_MAX_FILES - attachments.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${SALE_PROOF_MAX_FILES} files`);
      return;
    }
    const selected = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      toast.message(`Only ${remaining} more file${remaining === 1 ? "" : "s"} can be added`);
    }
    setAttachmentUploading(true);
    try {
      const formData = new FormData();
      for (const file of selected) {
        formData.append("attachment", file);
      }
      const result = await uploadCreateOrderAttachmentsAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const uploaded = result.paths.map((path, index) => ({
        path,
        name: selected[index]?.name ?? path.split("/").pop() ?? "attachment",
      }));
      setTouched(true);
      setAttachments((prev) => [...prev, ...uploaded]);
      toast.success(
        uploaded.length === 1 ? "Attachment uploaded" : `${uploaded.length} attachments uploaded`,
      );
    } finally {
      setAttachmentUploading(false);
    }
  }

  function submit() {
    if (submitStarted.current || pending || attachmentUploading) return;
    if (!worksheet || !activeBrandId || createDetails.length === 0 || openOrderMessage) return;
    submitStarted.current = true;
    const orderedIds = new Set(createDetails.map((line) => line.modelId));
    const zeroSrp = brandProjectedLines.filter(
      (line) => orderedIds.has(line.modelId) && line.srp <= 0,
    );
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
        brandId: activeBrandId,
        modeOfPaymentId: modeOfPaymentId || null,
        notes: notes.trim() || undefined,
        attachments:
          attachments.length > 0 ? attachments.map((file) => file.path) : undefined,
        details: createDetails,
      });
      const waitMs = CREATE_ORDER_MIN_LOADING_MS - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      if (result.error) {
        submitStarted.current = false;
        if (isOpenBranchBrandOrderMessage(result.error)) {
          setOpenOrderLookup({
            branchId,
            brandId: activeBrandId,
            orderType: baseType,
            message: result.error,
          });
          setOpenOrderDialogOpen(true);
          return;
        }
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
    attachmentUploading ||
    !typeAllowed ||
    !loaded ||
    !activeBrandId ||
    checkingOpenOrder ||
    openOrderMessage !== null ||
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
  const dealerName = branchDealer(branch, dealers)?.name ?? "";
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
                <div className="min-w-0">
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
                <div className="min-w-0">
                  <label htmlFor="create-order-attachments" className="text-sm text-muted-foreground">
                    Attachments
                  </label>
                  <Input
                    id="create-order-attachments"
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    className="mt-1.5"
                    disabled={
                      noteDisabled ||
                      attachmentUploading ||
                      attachments.length >= SALE_PROOF_MAX_FILES
                    }
                    onChange={(event) => {
                      const picked = event.target.files;
                      void onAttachmentsSelected(picked);
                      event.target.value = "";
                    }}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Optional. You can attach up to {SALE_PROOF_MAX_FILES} images or PDFs
                    {attachments.length > 0 ? ` · ${attachments.length} attached` : ""}.
                  </p>
                  {attachments.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {attachments.map((file) => (
                        <li
                          key={file.path}
                          className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                        >
                          <span className="min-w-0 truncate" title={file.name}>
                            {file.name}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={noteDisabled || attachmentUploading}
                            onClick={() => {
                              setTouched(true);
                              setAttachments((prev) => prev.filter((item) => item.path !== file.path));
                            }}
                            aria-label={`Remove ${file.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
                brandId={activeBrandId}
                onBrandIdChange={setBrandId}
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
                  figures={planningFigures}
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
        open={openOrderDialogOpen && openOrderMessage != null}
        onOpenChange={setOpenOrderDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{OPEN_BRANCH_BRAND_ORDER_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{openOrderMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  initialBranchId = "",
  initialModeOfPaymentId = "",
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  canCreateManual: boolean;
  canCreateSpecial: boolean;
  initialBranchId?: string;
  initialModeOfPaymentId?: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (choice: OrderSetupChoice) => void;
}) {
  const wasOpen = useRef(false);
  // The order type is decided on the order page from its lines; lookups only need a type
  // the user may create, for their permission checks.
  const draftType: CreatableOrderType = canCreateManual ? "manual" : "special";
  const [draftBranchId, setDraftBranchId] = useState(initialBranchId);
  const [dealers, setDealers] = useState<OrderDealerOption[]>([]);
  const [branches, setBranches] = useState<OrderBranchOption[]>([]);
  const [modesOfPayment, setModesOfPayment] = useState<OrderModeOfPaymentOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setDraftBranchId(initialBranchId);
    setLoaded(false);
  }, [initialBranchId, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [dealerRows, modeRows, branchRows] = await Promise.all([
        listActiveDealersForOrderAction(draftType),
        listModesOfPaymentForOrderAction(draftType),
        listBranchesForOrderAction(undefined, draftType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setModesOfPayment(modeRows);
      setBranches(branchRows);
      // A prefilled branch outside the user's list is dropped, not shown as a bare id.
      setDraftBranchId((current) => (branchRows.some((row) => row.id === current) ? current : ""));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftType, open]);

  const branch = branches.find((option) => option.id === draftBranchId) ?? null;
  const dealer = branchDealer(branch, dealers);
  // A new branch fills mode of payment from its dealer. There is no per-order override.
  // Until the branch list has loaded, keep the payment this dialog opened with.
  const draftPaymentId =
    open && loaded
      ? defaultModeOfPaymentId(dealer, modesOfPayment)
      : initialModeOfPaymentId;
  const modeOfPayment = modesOfPayment.find((mode) => mode.id === draftPaymentId) ?? null;
  const paymentKind = modeOfPayment?.kind ?? null;
  const dealerById = useMemo(
    () => new Map(dealers.map((row) => [row.id, row.name])),
    [dealers],
  );
  const dealerDefaultPaymentId = defaultModeOfPaymentId(dealer, modesOfPayment);
  const paymentFromDealer = Boolean(dealerDefaultPaymentId);
  const partyBlock =
    branch && paymentFromDealer ? orderPartyBlock({ kind: paymentKind, branch }) : null;
  const typeAllowed = canCreateManual || canCreateSpecial;
  const canContinue =
    loaded && typeAllowed && Boolean(draftBranchId) && paymentFromDealer && partyBlock === null;
  const paymentLabel = modeOfPayment
    ? `${modeOfPayment.name}${paymentKind ? ` (${MODE_OF_PAYMENT_KIND_LABELS[paymentKind]})` : ""}`
    : "Not set";
  const paymentNote = !branch
    ? null
    : !dealer
      ? "This branch has no dealer. Set the dealer and its mode of payment before creating an order."
      : !paymentFromDealer
        ? `${dealer.name} has no mode of payment set. Set it on the dealer.`
        : "From the dealer.";

  function continueWithChoice() {
    if (!dealerDefaultPaymentId) return;
    onContinue({
      dealerId: paymentKind === "CONSIGNMENT" ? (branch?.dealerId ?? "") : "",
      branchId: draftBranchId,
      modeOfPaymentId: dealerDefaultPaymentId,
    });
  }

  function changeBranch(next: string) {
    if (next === draftBranchId) return;
    setDraftBranchId(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create order</DialogTitle>
          <DialogDescription>
            Choose the branch. Its dealer and mode of payment fill in from the dealer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading branches…</p>
          ) : (
            <>
              <SearchableSelect
                label="Branch"
                className="w-full"
                options={branches.map((option) => {
                  const dealerName = option.dealerId ? dealerById.get(option.dealerId) : undefined;
                  return {
                    id: option.id,
                    label: option.name,
                    // The dealer name makes branches searchable by dealer too.
                    description: dealerName ? `${option.sapCode} · ${dealerName}` : option.sapCode,
                  };
                })}
                value={draftBranchId}
                onChange={changeBranch}
                placeholder="Select branch…"
                searchPlaceholder="Search branches or dealers…"
                emptyMessage="No active branches are available for this order."
              />
              {branch ? (
                <>
                  <OrderReadout label="Dealer" value={dealer?.name ?? "No dealer"} />
                  <div className="space-y-1.5">
                    <OrderReadout label="Mode of payment" value={paymentLabel} />
                    {paymentNote ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">{paymentNote}</p>
                    ) : null}
                  </div>
                  {paymentKind === "OUTRIGHT" && branch.bpCode ? (
                    <OrderReadout label="BP Code (SAP customer)" value={branch.bpCode} />
                  ) : null}
                  {paymentKind && partyBlock ? (
                    <p className={ORDER_PARTY_BLOCK_CLASS}>{partyBlock}</p>
                  ) : null}
                </>
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
