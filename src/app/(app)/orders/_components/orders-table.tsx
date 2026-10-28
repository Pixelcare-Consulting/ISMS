"use client";

import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { CreateOrderSetupDialog } from "@/app/(app)/orders/_components/create-order-form";
import {
  adminBulkCancelOrdersAction,
  approveOrderAction,
  deleteDraftOrderAction,
  listOrdersAction,
  rejectOrderAction,
  submitDraftOrderAction,
} from "@/features/orders/actions/order.actions";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import {
  canApproveOrder,
  isOrderPendingApproval,
  isSuperAdminOrderOverride,
  PRODUCT_SPECIALIST_ROLE_SLUG,
} from "@/features/orders/constants/order-workflow";
import { OrderDetailsDialog } from "@/app/(app)/orders/_components/order-details-dialog";
import { SuggestedOrdersDialog } from "@/app/(app)/orders/_components/suggested-orders-dialog";
import { OrderWorkflowDialog } from "@/app/(app)/orders/_components/order-workflow-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { OrderTypeBadge } from "@/features/orders/components/order-type-badge";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  formatOrderModeOfPayment,
  orderModeOfPaymentSearchText,
  resolveOrderModeOfPayment,
  type OrderSapDocType,
} from "@/features/orders/constants/order-sap-doc-type";
import type { ModeOfPaymentKindValue } from "@/features/lookups/constants/mode-of-payment-kind";
import { ModeOfPaymentBadge } from "@/features/orders/components/mode-of-payment-badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { matchesTableSearch } from "@/utils/match-table-search";
import type { ManualSpecialTypeFilter } from "@/features/orders/lib/manual-special-order-scope";
import { describeSapOrderRejection } from "@/features/orders/lib/sap-order-rejection";

interface OrderRow {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  branchId: string;
  brandId?: string | null;
  notes?: string | null;
  spaRemarks?: string | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
  reviewSnapshot?: unknown;
  reviewSnapshotAt?: string | Date | null;
  sapDocType?: OrderSapDocType | null;
  sapDocNum?: number | null;
  deliveryDueDate?: string | Date | null;
  modeOfPayment?: ModeOfPaymentRow | null;
  branch: {
    name: string;
    deliverySchedule?: unknown;
    dealer?: { modeOfPayment: ModeOfPaymentRow | null } | null;
  };
  createdBy: { name: string | null; email: string };
  details: {
    id: string;
    quantity: number;
    approvedQty?: number | null;
    remarks?: string | null;
    spRemarks?: string | null;
    model: { id: string; skuCode: string; name?: string; brandId?: string | null };
  }[];
  approvalLevels?: {
    level: number;
    roleSlug: string;
    approvedAt?: string | Date | null;
    rejectedAt?: string | Date | null;
    comment?: string | null;
    approvedBy?: { name: string | null; email: string } | null;
  }[];
}

interface ModeOfPaymentRow {
  name: string;
  kind?: ModeOfPaymentKindValue | null;
}

const orderColumn = createColumnHelper<DataTableFeatures, OrderRow>();

function orderRowModeOfPayment(order: OrderRow) {
  return resolveOrderModeOfPayment({
    orderModeOfPayment: order.modeOfPayment,
    dealerModeOfPayment: order.branch.dealer?.modeOfPayment,
  });
}

type OrderSortField = "orderNumber" | "branch" | "orderType" | "status" | "createdAt";
type OrderSortDir = "asc" | "desc";

interface OrdersTableProps {
  result: {
    items: OrderRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  viewerRoleSlugs: string[];
  canEdit?: boolean;
  /** When set, list is type-scoped and create dialog locks this type. */
  fixedOrderType?: BranchOrderType;
  /** Combined Manual/Special list. Sent back to the server on the team-leader filter. */
  listFilter?: ManualSpecialTypeFilter;
  /** Manual/Special create is offered. The button opens the setup popup, then the create page. */
  createHref?: string | null;
  /** Create permission per row type. Falls back to `canEdit` when omitted. */
  createByType?: Partial<Record<BranchOrderType, boolean>>;
  /** Suggested orders dialog type. Falls back to `fixedOrderType`. */
  suggestionOrderType?: BranchOrderType;
  /** Base path for pagination links (defaults to `/orders`). */
  basePath?: string;
  initialSort?: string;
  /** Team Leaders offered in the TL filter; hidden when empty. */
  teamLeaders?: { id: string; name: string }[];
  initialSortDir?: string;
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

/** Stored creator. Name when the account has one, otherwise the account email. */
function orderCreatorLabel(createdBy: OrderRow["createdBy"] | null | undefined): string {
  const name = createdBy?.name?.trim();
  if (name) return name;
  const email = createdBy?.email?.trim();
  return email || "—";
}

const ORDER_CREATED_DATE = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

const ORDER_CREATED_TIME = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function OrderCreatedAtCell({ value }: { value: string | Date | null | undefined }) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (
    <div className="whitespace-normal leading-tight">
      <p>{ORDER_CREATED_DATE.format(date)}</p>
      <p>{ORDER_CREATED_TIME.format(date)}</p>
    </div>
  );
}

function buildOrdersHref(
  basePath: string,
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
  teamLeaderId?: string | null,
  typeFilter?: string | null,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  if (teamLeaderId) params.set("tl", teamLeaderId);
  if (typeFilter === "manual" || typeFilter === "special") params.set("type", typeFilter);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function buildOrdersHrefWithTab(
  basePath: string,
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
  tab?: string | null,
  teamLeaderId?: string | null,
  typeFilter?: string | null,
): string {
  const href = buildOrdersHref(basePath, page, limit, sort, sortDir, teamLeaderId, typeFilter);
  if (!tab || tab === "orders") return href;
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}tab=${tab}`;
}

function rowCreatePermission(
  orderType: string,
  canEdit: boolean,
  createByType?: Partial<Record<BranchOrderType, boolean>>,
): boolean {
  if (!createByType) return canEdit;
  switch (orderType) {
    case "manual":
    case "special":
    case "auto_replenish":
      return Boolean(createByType[orderType]);
    default:
      return false;
  }
}

export function OrdersTable({
  result: serverResult,
  viewerRoleSlugs,
  canEdit = false,
  fixedOrderType,
  listFilter,
  createHref,
  createByType,
  suggestionOrderType,
  basePath = "/orders",
  initialSort = "",
  initialSortDir = "desc",
  teamLeaders = [],
}: OrdersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * The TL filter reloads only the table: its page of orders replaces the server's until
   * the server renders again (paging, sorting, a refresh after an action), which then
   * already reads `tl` from the URL.
   */
  const [filteredList, setFilteredList] = useState<{
    source: OrdersTableProps["result"];
    result: OrdersTableProps["result"];
  } | null>(null);
  const result =
    filteredList && filteredList.source === serverResult ? filteredList.result : serverResult;
  const [filtering, startFiltering] = useTransition();
  const filterRequest = useRef(0);
  /** The TL just picked, shown while its orders load; the URL takes over once they do. */
  const [pickedTeamLeaderId, setPickedTeamLeaderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [workflowOrder, setWorkflowOrder] = useState<OrderRow | null>(null);
  const [sapRejection, setSapRejection] = useState<{ sapMessage: string | null } | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<OrderRow | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [createSetupOpen, setCreateSetupOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [processingAction, setProcessingAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const canCreateManual =
    createByType?.manual ?? (fixedOrderType === "manual" ? canEdit : false);
  const canCreateSpecial =
    createByType?.special ?? (fixedOrderType === "special" ? canEdit : false);
  const showCreateOrder = Boolean(createHref) || canCreateManual || canCreateSpecial;
  const setupInitialType =
    listFilter === "special" && canCreateSpecial
      ? "special"
      : canCreateManual
        ? "manual"
        : "special";
  const suggestedType = suggestionOrderType ?? (canEdit ? fixedOrderType : undefined);
  const pageSize = parseTablePageSize(result.limit);
  const pageTab = searchParams.get("tab");
  const teamLeaderId = searchParams.get("tl") ?? "";
  const urlType = searchParams.get("type");
  const preservedType = urlType === "manual" || urlType === "special" ? urlType : null;
  const activeListFilter: ManualSpecialTypeFilter | undefined =
    listFilter === undefined ? undefined : preservedType ?? "all";
  const teamLeaderOptions = useMemo(
    () => teamLeaders.map((leader) => ({ id: leader.id, label: leader.name })),
    [teamLeaders],
  );
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as OrderSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildOrdersHrefWithTab(
        basePath,
        1,
        limit,
        sort,
        sort ? sortDir : undefined,
        pageTab,
        teamLeaderId,
        preservedType,
      ),
    );
  }

  /**
   * Server-side, since a TL covers more branches than one page holds, but without a route
   * navigation: that re-rendered the whole page. The URL still records the filter.
   */
  function handleTeamLeaderChange(nextTeamLeaderId: string) {
    const request = ++filterRequest.current;
    setPickedTeamLeaderId(nextTeamLeaderId);
    const href = buildOrdersHrefWithTab(
      basePath,
      1,
      pageSize,
      sort,
      sort ? sortDir : undefined,
      pageTab,
      nextTeamLeaderId,
      preservedType,
    );
    startFiltering(async () => {
      try {
        const next = await listOrdersAction({
          page: 1,
          limit: pageSize,
          orderType: activeListFilter ? undefined : fixedOrderType,
          listFilter: activeListFilter,
          sort: sort || undefined,
          sortDir: sort ? sortDir : undefined,
          teamLeaderId: nextTeamLeaderId || undefined,
        });
        // A later pick already replaced this one.
        if (request !== filterRequest.current) return;
        setFilteredList({ source: serverResult, result: next });
        setRowSelection({});
        window.history.pushState(null, "", href);
      } catch {
        if (request === filterRequest.current) toast.error("Could not load orders. Try again.");
      } finally {
        if (request === filterRequest.current) setPickedTeamLeaderId(null);
      }
    });
  }

  function toggleSort(field: OrderSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildOrdersHrefWithTab(
        basePath,
        1,
        pageSize,
        next.sort,
        next.dir,
        pageTab,
        teamLeaderId,
        preservedType,
      ),
    );
  }

  const filtered = useMemo(
    () =>
      result.items.filter((o) =>
        matchesTableSearch(query, [
          o.id,
          o.orderNumber,
          o.branch.name,
          o.status,
          o.createdBy?.name,
          o.createdBy?.email,
          orderModeOfPaymentSearchText(orderRowModeOfPayment(o)),
        ]),
      ),
    [result.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((o) => o.orderNumber),
        result.items.map((o) => o.branch.name),
        result.items.map((o) => o.status),
        result.items.map((o) => o.createdBy?.name),
        result.items.map((o) => o.createdBy?.email),
      ),
    [result.items],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const detailsOrder = useMemo(
    () => result.items.find((item) => item.id === detailsOrderId) ?? null,
    [detailsOrderId, result.items],
  );
  const canSuperAdminBulkCancel = isSuperAdminOrderOverride(viewerRoleSlugs);
  const selectedOrderIds = useMemo(
    () => filtered.map((order) => order.id).filter((id) => rowSelection[id]),
    [filtered, rowSelection],
  );
  const selectedCount = selectedOrderIds.length;

  function handleApprove(input?: {
    comment?: string;
    lineAdjustments?: {
      detailId: string;
      approvedQty: number;
      spRemarks?: string | null;
    }[];
    deliveryDueDate?: string;
    expectedUpdatedAt?: string;
    reviewSnapshot?: {
      kind: "order-review-snapshot";
      version: 1;
    };
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
      if ("sapRejected" in result && result.sapRejected) {
        setSapRejection({ sapMessage: result.sapMessage });
        if (result.updatedAt) {
          const updatedAt = result.updatedAt;
          setWorkflowOrder((current) => (current ? { ...current, updatedAt } : current));
        }
        router.refresh();
        return;
      }
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
        toast.error(result.error);
        return;
      }
      toast.success("Order rejected");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<OrderRow>[] = [
      orderColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      orderColumn.accessor((row) => row.orderNumber, {
        id: "orderNumber",
        header: "Order #",
        enableSorting: true,
        meta: { className: "font-mono" },
      }),
      orderColumn.accessor((row) => row.branch.name, {
        id: "branch",
        header: "Branch",
        enableSorting: true,
      }),
      orderColumn.display({
        id: "orderType",
        header: "Type",
        enableSorting: true,
        cell: ({ row }) => <OrderTypeBadge orderType={row.original.orderType} />,
      }),
      orderColumn.display({
        id: "modeOfPayment",
        header: "Mode of payment",
        enableSorting: false,
        cell: ({ row }) => (
          <ModeOfPaymentBadge modeOfPayment={orderRowModeOfPayment(row.original)} />
        ),
      }),
      orderColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <StatusCodeBadge
            code={row.original.status}
            name={
              BRANCH_ORDER_STATUS_LABELS[row.original.status as BranchOrderStatus] ??
              row.original.status
            }
          />
        ),
      }),
      orderColumn.display({
        id: "createdBy",
        header: "Created by",
        enableSorting: false,
        cell: ({ row }) => orderCreatorLabel(row.original.createdBy),
        meta: { className: "max-w-40 truncate" },
      }),
      orderColumn.display({
        id: "createdAt",
        header: "Created at",
        enableSorting: true,
        cell: ({ row }) => <OrderCreatedAtCell value={row.original.createdAt} />,
        meta: { className: "tabular-nums" },
      }),
      orderColumn.display({
        id: "lines",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) => {
          const label = row.original.details
            .map((detail) => `${detail.model.skuCode}×${detail.quantity}`)
            .join(", ");
          if (!label) return "—";
          return (
            <span className="block max-w-xs truncate" title={label}>
              {label}
            </span>
          );
        },
        meta: { className: "max-w-xs" },
      }),
      orderColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              {isOrderPendingApproval(order.status as BranchOrderStatus) ? (
                <OrderReviewButton
                  order={order}
                  viewerRoleSlugs={viewerRoleSlugs}
                  onReview={() => setWorkflowOrder(order)}
                />
              ) : null}
              {rowCreatePermission(order.orderType, canEdit, createByType) &&
              order.status === "draft" ? (
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await submitDraftOrderAction(order.id);
                      if ("error" in result && result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Submitted for review", {
                        description: draftSubmitDescription(order.orderType),
                      });
                      router.refresh();
                    });
                  }}
                >
                  Submit for review
                </Button>
              ) : null}
              {rowCreatePermission(order.orderType, canEdit, createByType) &&
              order.status === "draft" ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="shrink-0"
                  disabled={pending}
                  onClick={() => setDraftToDelete(order)}
                >
                  Delete
                </Button>
              ) : null}
              {showOrderViewDetails(order, viewerRoleSlugs) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setDetailsOrderId(order.id)}
                >
                  View details
                </Button>
              ) : null}
            </div>
          );
        },
        meta: { align: "end", className: "w-px whitespace-nowrap" },
      }),
    ];
    return cols;
  }, [canEdit, createByType, pending, router, viewerRoleSlugs]);

  const sapRejectionCopy = sapRejection
    ? describeSapOrderRejection(sapRejection.sapMessage)
    : null;

  return (
    <>
      <DataTable
        data={filtered}
        columns={columns}
        loading={filtering}
        tableClassName="w-max min-w-full [&_td]:py-1.5 [&_th]:py-1.5"
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (columnId) => toggleSort(columnId as OrderSortField),
        }}
        // Selection only feeds Super Admin bulk cancel; other roles have nothing to do with it.
        enableRowSelection={canSuperAdminBulkCancel}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all orders"
        getSelectionLabel={(row) => `Select order ${row.orderNumber}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search orders…",
          suggestions,
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        searchTrailing={
          teamLeaderOptions.length > 0 || teamLeaderId ? (
            <div className="flex items-center gap-2">
              {/* After search, so the list opens over the toolbar instead of the Type column. */}
              <SearchableSelect
                id="orders-team-leader-filter"
                options={teamLeaderOptions}
                value={pickedTeamLeaderId ?? teamLeaderId}
                onChange={handleTeamLeaderChange}
                placeholder="All team leaders"
                searchPlaceholder="Search team leaders…"
                emptyMessage="No team leader matches."
                allowClear
                side="top"
                align="end"
                className="w-52"
              />
              {/* Always mounted so screen readers announce the change. */}
              <span
                role="status"
                aria-live="polite"
                className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
              >
                {filtering ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span>Loading orders…</span>
                  </>
                ) : null}
              </span>
            </div>
          ) : null
        }
        toolbarActions={
          <>
            {selectedCount > 0 ? (
              <>
                <Button variant="secondary" onClick={() => setRowSelection({})}>
                  {selectedCount} selected
                </Button>
                {canSuperAdminBulkCancel ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => setBulkCancelOpen(true)}
                  >
                    Cancel selected
                  </Button>
                ) : null}
              </>
            ) : null}
            {suggestedType ? (
              <Button type="button" variant="outline" onClick={() => setSuggestionsOpen(true)}>
                Suggested orders
              </Button>
            ) : null}
            {showCreateOrder ? (
              <Button type="button" onClick={() => setCreateSetupOpen(true)}>
                Create order
              </Button>
            ) : null}
          </>
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "order",
          buildHref: (page) =>
            buildOrdersHrefWithTab(
              basePath,
              page,
              pageSize,
              sort,
              sort ? sortDir : undefined,
              pageTab,
              teamLeaderId,
              preservedType,
            ),
        }}
        empty={filtered.length === 0}
        emptyMessage={
          query.trim()
            ? "No orders match your search."
            : teamLeaderId
              ? "No orders from this team leader's branches."
              : "No orders."
        }
      />
      {detailsOrder ? (
        <OrderDetailsDialog
          orderId={detailsOrder.id}
          orderNumber={detailsOrder.orderNumber}
          orderType={detailsOrder.orderType as BranchOrderType}
          branchId={detailsOrder.branchId}
          branchName={detailsOrder.branch.name}
          status={detailsOrder.status as BranchOrderStatus}
          notes={detailsOrder.notes}
          deliveryDueDate={detailsOrder.deliveryDueDate}
          createdByName={detailsOrder.createdBy.name ?? detailsOrder.createdBy.email}
          reviewSnapshot={detailsOrder.reviewSnapshot}
          reviewSnapshotAt={detailsOrder.reviewSnapshotAt}
          sapDocType={detailsOrder.sapDocType}
          sapDocNum={detailsOrder.sapDocNum}
          modeOfPaymentLabel={formatOrderModeOfPayment({
            orderModeOfPayment: detailsOrder.modeOfPayment?.name ?? null,
            dealerModeOfPayment: detailsOrder.branch.dealer?.modeOfPayment?.name ?? null,
          })}
          lines={detailsOrder.details.map((d) => ({
            detailId: d.id,
            modelId: d.model.id,
            skuCode: d.model.skuCode,
            name: d.model.name,
            quantity: d.quantity,
            approvedQty: d.approvedQty,
            remarks: d.remarks,
            spRemarks: d.spRemarks,
          }))}
          approvalLevels={detailsOrder.approvalLevels}
          roleSlugs={viewerRoleSlugs}
          hasCreatePermission={
            detailsOrder
              ? rowCreatePermission(detailsOrder.orderType, canEdit, createByType)
              : canEdit
          }
          open
          onOpenChange={(open) => {
            if (!open) setDetailsOrderId(null);
          }}
        />
      ) : null}
      {workflowOrder ? (
        <OrderWorkflowDialog
          orderId={workflowOrder.id}
          orderNumber={workflowOrder.orderNumber}
          orderType={workflowOrder.orderType as "auto_replenish" | "manual" | "special"}
          branchId={workflowOrder.branchId}
          branchName={workflowOrder.branch.name}
          createdAt={workflowOrder.createdAt}
          updatedAt={workflowOrder.updatedAt}
          deliverySchedule={workflowOrder.branch.deliverySchedule}
          lines={workflowOrder.details.map((d) => ({
            detailId: d.id,
            modelId: d.model.id,
            skuCode: d.model.skuCode,
            quantity: d.quantity,
            remarks: d.remarks,
            spRemarks: d.spRemarks,
          }))}
          approvalLevels={workflowOrder.approvalLevels}
          status={workflowOrder.status as BranchOrderStatus}
          open
          pending={pending}
          onOpenChange={() => {
            if (sapRejection) return;
            setWorkflowOrder(null);
          }}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
      <AlertDialog
        open={sapRejection !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSapRejection(null);
        }}
      >
        <AlertDialogContent
          className="z-[80] gap-0 sm:max-w-lg"
          overlayClassName="z-[80]"
        >
          <AlertDialogHeader className="space-y-4 text-left">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CircleAlert className="size-4" aria-hidden />
              </span>
              <AlertDialogTitle className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
                This order could not be approved
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild className="text-foreground">
              <div className="space-y-4 text-left text-sm leading-relaxed">
                <p className="text-muted-foreground">
                  This order is still waiting for Supply Planning. It keeps the same order
                  number, so you do not need to create a new one.
                </p>
                <div className="rounded-lg border border-border/80 border-l-[3px] border-l-primary/70 bg-muted/40 px-3.5 py-3">
                  <p className="font-medium text-foreground">{sapRejectionCopy?.summary}</p>
                  {sapRejectionCopy?.detail ? (
                    <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                      {sapRejectionCopy.detail}
                    </p>
                  ) : null}
                </div>
                <p className="text-foreground">{sapRejectionCopy?.nextStep}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 mt-5 border-t px-4 pt-4 sm:-mx-6 sm:justify-end sm:px-6">
            <AlertDialogAction
              className="w-full sm:w-auto"
              onClick={() => setSapRejection(null)}
            >
              Back to the order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {draftToDelete ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDraftToDelete(null);
          }}
          title="Delete draft order"
          description={`Discard unsubmitted draft ${draftToDelete.orderNumber}? This cannot be undone. Orders already submitted for review cannot be deleted — use Review to reject or cancel instead.`}
          pending={pending}
          confirmLabel="Discard draft"
          onConfirm={() => {
            const orderId = draftToDelete.id;
            startTransition(async () => {
              const result = await deleteDraftOrderAction(orderId);
              if ("error" in result && result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Draft discarded");
              setDraftToDelete(null);
              router.refresh();
            });
          }}
        />
      ) : null}
      {bulkCancelOpen ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) setBulkCancelOpen(false);
          }}
          title="Cancel selected orders?"
          description={`This applies to ${selectedCount} selected order${selectedCount === 1 ? "" : "s"}. Unsubmitted drafts are discarded permanently. Pending orders are marked Cancelled and move to Order History. Approved, rejected, cancelled, or delivery-linked orders are skipped.`}
          pending={pending}
          confirmLabel="Cancel selected"
          onConfirm={() => {
            const orderIds = selectedOrderIds;
            if (orderIds.length === 0) return;
            startTransition(async () => {
              const result = await adminBulkCancelOrdersAction(orderIds);
              if (!("success" in result)) {
                toast.error(result.error);
                return;
              }
              const parts: string[] = [];
              if (result.discarded > 0) {
                parts.push(
                  `Discarded ${result.discarded} draft${result.discarded === 1 ? "" : "s"}`,
                );
              }
              if (result.cancelled > 0) {
                parts.push(
                  `Cancelled ${result.cancelled} order${result.cancelled === 1 ? "" : "s"}`,
                );
              }
              const summary = parts.join("; ");
              if (result.skipped.length > 0) {
                const skipDetail = result.skipped
                  .slice(0, 3)
                  .map((s) => `${s.orderNumber}: ${s.reason}`)
                  .join(" · ");
                const more =
                  result.skipped.length > 3
                    ? ` (+${result.skipped.length - 3} more)`
                    : "";
                toast.success(summary, {
                  description: `Skipped: ${skipDetail}${more}`,
                });
              } else {
                toast.success(summary);
              }
              setBulkCancelOpen(false);
              setRowSelection({});
              router.refresh();
            });
          }}
        />
      ) : null}
      {suggestionsOpen && suggestedType ? (
        <SuggestedOrdersDialog
          orderType={suggestedType}
          onClose={() => setSuggestionsOpen(false)}
        />
      ) : null}
      <CreateOrderSetupDialog
        open={createSetupOpen}
        canCreateManual={canCreateManual}
        canCreateSpecial={canCreateSpecial}
        initialType={setupInitialType}
        onOpenChange={setCreateSetupOpen}
        onContinue={(choice) => {
          const params = new URLSearchParams();
          params.set("type", choice.orderType);
          params.set("dealerId", choice.dealerId);
          params.set("branchId", choice.branchId);
          if (choice.modeOfPaymentId) params.set("modeOfPaymentId", choice.modeOfPaymentId);
          params.set("ready", "1");
          setCreateSetupOpen(false);
          router.push(`/orders/manual/new?${params.toString()}`);
        }}
      />
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
    </>
  );
}

interface OrderReviewButtonProps {
  order: OrderRow;
  viewerRoleSlugs: string[];
  onReview: () => void;
}

function draftSubmitDescription(orderType: string): string {
  if (orderType === "auto_replenish") {
    return "Team Leader can review this order now.";
  }
  return "Supply Planning can review this order now.";
}

/**
 * View details shows once this viewer no longer has Review on the row
 * (approved, rejected, cancelled, or any step past their review), including Order History.
 * Product Specialists always keep View details. Review itself is unchanged.
 */
function showOrderViewDetails(order: OrderRow, viewerRoleSlugs: string[]): boolean {
  if (viewerRoleSlugs.includes(PRODUCT_SPECIALIST_ROLE_SLUG)) return true;
  const status = order.status as BranchOrderStatus;
  const orderType = order.orderType as BranchOrderType;
  const reviewShown =
    isOrderPendingApproval(status) && canApproveOrder(status, orderType, viewerRoleSlugs);
  return !reviewShown;
}

function OrderReviewButton({ order, viewerRoleSlugs, onReview }: OrderReviewButtonProps) {
  const status = order.status as BranchOrderStatus;
  const orderType = order.orderType as BranchOrderType;
  if (!canApproveOrder(status, orderType, viewerRoleSlugs)) {
    return null;
  }

  return (
    <Button size="sm" variant="outline" className="shrink-0" onClick={onReview}>
      Review
    </Button>
  );
}

