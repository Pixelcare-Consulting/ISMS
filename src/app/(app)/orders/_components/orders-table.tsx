"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveOrderAction,
  checkOrderWindowAction,
  createOrderAction,
  listActiveDealersForOrderAction,
  listBranchesForOrderAction,
  listModelsForOrderAction,
  rejectOrderAction,
} from "@/features/orders/actions/order.actions";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import {
  canApproveOrder,
  getOrderReviewDenialReason,
  isOrderPendingApproval,
} from "@/features/orders/constants/order-workflow";
import { OrderWorkflowDialog } from "@/app/(app)/orders/_components/order-workflow-dialog";
import { Button } from "@/components/ui/button";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { OrderTypeBadge } from "@/features/orders/components/order-type-badge";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { DataTableScroll, DataTableShell } from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchToolbar, uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { matchesTableSearch } from "@/utils/match-table-search";

interface OrderRow {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  branch: { name: string; deliverySchedule?: unknown };
  createdBy: { name: string | null; email: string };
  details: {
    id: string;
    quantity: number;
    model: { skuCode: string };
  }[];
}

interface OrderModelOption {
  id: string;
  skuCode: string;
  name: string;
  maxQty: number | null;
  stockCount?: number;
  remainingCapacity?: number;
  onPlanogram: boolean;
}

interface OrdersTableProps {
  result: {
    items: OrderRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  viewerRoleSlugs: string[];
}

const ORDER_APPROVE_FEED = [
  { atSecond: 0, label: "Recording approval", hint: "Saving your decision to the order." },
  { atSecond: 1, label: "Updating workflow status", hint: "Applying the next step in the chain." },
  { atSecond: 2, label: "Syncing logistics queue", hint: "Preparing fulfillment handoff when applicable." },
  { atSecond: 3, label: "Refreshing orders list" },
] as const;

const ORDER_REJECT_FEED = [
  { atSecond: 0, label: "Recording rejection", hint: "Saving your comment and status." },
  { atSecond: 1, label: "Updating order record" },
  { atSecond: 2, label: "Refreshing orders list" },
] as const;

/** Keep loading modal open until feed steps can play out (even if API is fast). */
function getMinLoadingDurationMs(feed: readonly { atSecond: number }[]): number {
  const lastAt = feed.reduce((max, item) => Math.max(max, item.atSecond), 0);
  return (lastAt + 2) * 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOrdersHref(page: number): string {
  return page > 1 ? `/orders?page=${page}` : "/orders";
}

export function OrdersTable({ result, viewerRoleSlugs }: OrdersTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [workflowOrder, setWorkflowOrder] = useState<OrderRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [processingAction, setProcessingAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(
    () =>
      result.items.filter((o) =>
        matchesTableSearch(query, [o.id, o.orderNumber, o.branch.name, o.status]),
      ),
    [result.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((o) => o.orderNumber),
        result.items.map((o) => o.branch.name),
        result.items.map((o) => o.status),
      ),
    [result.items],
  );

  const selection = useTableSelection(filtered.map((o) => o.id));

  function handleApprove(input?: {
    comment?: string;
    lineAdjustments?: { detailId: string; approvedQty: number }[];
    deliveryDueDate?: string;
  }) {
    if (!workflowOrder) return;
    setProcessingAction("approve");
    startTransition(async () => {
      const feed = ORDER_APPROVE_FEED;
      const minMs = getMinLoadingDurationMs(feed);
      const started = Date.now();
      const result = await approveOrderAction(workflowOrder.id, input);
      const waitMs = minMs - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      setProcessingAction(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Approval recorded");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  function handleReject(comment?: string) {
    if (!workflowOrder) return;
    setProcessingAction("reject");
    startTransition(async () => {
      const feed = ORDER_REJECT_FEED;
      const minMs = getMinLoadingDurationMs(feed);
      const started = Date.now();
      const result = await rejectOrderAction(workflowOrder.id, comment);
      const waitMs = minMs - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      setProcessingAction(null);
      if (result.error) {
        toast.error("Could not reject");
        return;
      }
      toast.success("Order rejected");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <TableSearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Search orders…"
        suggestions={suggestions}
      >
        {selection.selectedCount > 0 ? (
          <Button variant="secondary" onClick={selection.clearSelection}>
            {selection.selectedCount} selected
          </Button>
        ) : null}
        <Button variant="outline" asChild>
          <a href="/planning/suggested-orders">Suggested orders</a>
        </Button>
        <Button onClick={() => setShowCreate(true)}>Create order</Button>
      </TableSearchToolbar>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  aria-label="Select all orders"
                />
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o, index) => (
              <TableRow key={o.id} data-state={selection.isRowSelected(o.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selection.isRowSelected(o.id)}
                    onCheckedChange={(checked) => selection.toggleRow(o.id, checked === true)}
                    aria-label={`Select order ${o.orderNumber}`}
                  />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-mono text-sm">{o.orderNumber}</TableCell>
                <TableCell>{o.branch.name}</TableCell>
                <TableCell>
                  <OrderTypeBadge orderType={o.orderType} />
                </TableCell>
                <TableCell>
                  <StatusCodeBadge
                    code={o.status}
                    name={
                      BRANCH_ORDER_STATUS_LABELS[o.status as BranchOrderStatus] ?? o.status
                    }
                  />
                </TableCell>
                <TableCell>
                  {o.details.map((d) => `${d.model.skuCode}×${d.quantity}`).join(", ")}
                </TableCell>
                <TableCell>
                  {isOrderPendingApproval(o.status as BranchOrderStatus) ? (
                    <OrderReviewButton
                      order={o}
                      viewerRoleSlugs={viewerRoleSlugs}
                      onReview={() => setWorkflowOrder(o)}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableScroll>
      <TablePagination
        meta={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "order",
        }}
        buildHref={buildOrdersHref}
      />
      {workflowOrder ? (
        <OrderWorkflowDialog
          orderNumber={workflowOrder.orderNumber}
          orderType={workflowOrder.orderType as "auto_replenish" | "manual" | "special"}
          branchName={workflowOrder.branch.name}
          deliverySchedule={workflowOrder.branch.deliverySchedule}
          lines={workflowOrder.details.map((d) => ({
            detailId: d.id,
            skuCode: d.model.skuCode,
            quantity: d.quantity,
          }))}
          status={workflowOrder.status as BranchOrderStatus}
          open
          pending={pending}
          onOpenChange={() => setWorkflowOrder(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
      {showCreate ? (
        <CreateOrderDialog onClose={() => setShowCreate(false)} />
      ) : null}
      <LoadingModal
        open={pending && processingAction !== null}
        title={
          processingAction === "reject" ? "Rejecting order" : "Processing approval"
        }
        description="Please wait while the order is saved."
        feedItems={
          processingAction === "reject" ? [...ORDER_REJECT_FEED] : [...ORDER_APPROVE_FEED]
        }
      />
    </DataTableShell>
  );
}

interface OrderReviewButtonProps {
  order: OrderRow;
  viewerRoleSlugs: string[];
  onReview: () => void;
}

function OrderReviewButton({ order, viewerRoleSlugs, onReview }: OrderReviewButtonProps) {
  const status = order.status as BranchOrderStatus;
  const orderType = order.orderType as BranchOrderType;
  const canReview = canApproveOrder(status, orderType, viewerRoleSlugs);
  const denialReason = getOrderReviewDenialReason(status, orderType);

  const button = (
    <Button
      size="sm"
      variant="outline"
      disabled={!canReview}
      onClick={() => {
        if (canReview) onReview();
      }}
    >
      Review
    </Button>
  );

  if (canReview) {
    return button;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block w-fit cursor-not-allowed">{button}</span>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          sideOffset={8}
          className="w-max max-w-[14rem] text-left text-pretty"
        >
          {denialReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CreateOrderDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<
    { id: string; name: string; dealerId: string | null }[]
  >([]);
  const [models, setModels] = useState<OrderModelOption[]>([]);
  const [dealerId, setDealerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderType, setOrderType] = useState<"manual" | "special" | "auto_replenish">("manual");
  const [modelId, setModelId] = useState("");
  const [qty, setQty] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [windowBlock, setWindowBlock] = useState<string | null>(null);

  const selectedModel = models.find((m) => m.id === modelId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [dealerRows, branchRows] = await Promise.all([
        listActiveDealersForOrderAction(),
        listBranchesForOrderAction(),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setBranches(branchRows);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !dealerId) return;
    let cancelled = false;
    void listBranchesForOrderAction(dealerId).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      setBranchId((current) =>
        branchRows.some((b) => b.id === current) ? current : (branchRows[0]?.id ?? ""),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [dealerId, loaded]);

  useEffect(() => {
    let cancelled = false;
    const branch = branchId;
    void Promise.resolve().then(async () => {
      if (!branch) {
        if (!cancelled) setWindowBlock(null);
        return;
      }
      const res = await checkOrderWindowAction(branch);
      if (!cancelled) setWindowBlock(res.blocked ? res.reason : null);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    void listModelsForOrderAction(branchId, orderType).then((m) => {
      if (cancelled) return;
      setModels(m);
      if (m[0]) setModelId(m[0].id);
      else setModelId("");
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, orderType]);

  function submit() {
    startTransition(async () => {
      const result = await createOrderAction({
        branchId,
        orderType,
        details: [{ modelId, quantity: qty }],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        orderType === "special"
          ? "Special order submitted for SP approval"
          : orderType === "auto_replenish"
            ? "Auto-replenish order submitted for TL review"
            : "Manual order submitted for PS review",
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md max-h-[calc(100svh-2rem)] overflow-y-auto space-y-4 rounded-xl border bg-card p-4 sm:p-6 shadow-lg">
        <h3 className="font-medium">Create branch order</h3>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading dealers and branches…</p>
        ) : (
          <>
            <SearchableSelect
              label="Dealer"
              options={dealers.map((d) => ({ id: d.id, label: d.name }))}
              value={dealerId}
              onChange={(next) => {
                setDealerId(next);
                setBranchId("");
                setModels([]);
                setModelId("");
              }}
              allowClear
              placeholder="Select dealer…"
              searchPlaceholder="Search dealers…"
            />
            <SearchableSelect
              label="Branch"
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
              value={branchId}
              onChange={setBranchId}
              placeholder={dealerId ? "Select branch…" : "Select a dealer first…"}
              searchPlaceholder="Search branches…"
              disabled={!dealerId}
              emptyMessage="No active branches for this dealer."
            />
            {windowBlock ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {windowBlock}
              </p>
            ) : null}
            <div>
              <SearchableSelect
                label="Order type"
                options={[
                  { id: "manual", label: "Manual (planogram SKUs)" },
                  { id: "auto_replenish", label: "Auto replenish (planogram SKUs)" },
                  { id: "special", label: "Special (off-planogram allowed)" },
                ]}
                value={orderType}
                onChange={(next) =>
                  setOrderType(next as "manual" | "special" | "auto_replenish")
                }
                searchPlaceholder="Search order types…"
              />
              {orderType === "auto_replenish" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Single-line auto-replenish here, or use suggested orders.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-replenish bulk path: Planning → Suggested orders.
                </p>
              )}
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <Link href="/planning/suggested-orders">View suggested orders</Link>
              </Button>
            </div>
            <div>
              <SearchableSelect
                label="Model"
                options={models.map((m) => ({
                  id: m.id,
                  label: `${m.skuCode} — ${m.name}${m.maxQty != null ? ` (max ${m.maxQty})` : ""}`,
                }))}
                value={modelId}
                onChange={setModelId}
                placeholder="Select model…"
                searchPlaceholder="Search models…"
                emptyMessage="No eligible SKUs for this branch and order type."
                disabled={!branchId}
              />
              {models.length === 0 && branchId ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No eligible SKUs for this branch and order type.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Quantity</Label>
              <input
                type="number"
                min={1}
                max={
                  (orderType === "manual" || orderType === "auto_replenish") &&
                  selectedModel?.remainingCapacity != null
                    ? selectedModel.remainingCapacity
                    : selectedModel?.maxQty ?? undefined
                }
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
              {(orderType === "manual" || orderType === "auto_replenish") &&
              selectedModel?.maxQty != null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Shelf capacity: {selectedModel.remainingCapacity ?? selectedModel.maxQty} remaining
                  of {selectedModel.maxQty} max
                  {selectedModel.stockCount != null ? ` (${selectedModel.stockCount} in stock)` : ""}
                </p>
              ) : selectedModel?.maxQty != null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Planogram max: {selectedModel.maxQty}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={pending || !dealerId || !branchId || !modelId || windowBlock !== null}
                onClick={submit}
              >
                Submit
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

