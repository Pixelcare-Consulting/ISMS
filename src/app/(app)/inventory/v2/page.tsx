import type { ReactNode } from "react";

import { BranchInventoryAllBranchesScreen } from "@/app/(app)/inventory/v2/_components/all-branches-screen";
import { BranchInventorySerialScreen } from "@/app/(app)/inventory/v2/_components/serial-list-screen";
import { BRANCH_INVENTORY_V2_PAGE_SIZE } from "@/app/(app)/inventory/v2/links";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  getBranchInventoryUnreadAction,
  getBranchInventoryV2CardAmountsAction,
  getInventoryKpisAction,
  getInventorySeriesSummaryAction,
  listInventoryAction,
  listInventoryGroupsAction,
  listInventoryStatusOptionsAction,
  listUnreadBranchInventoryIdsAction,
  type InventoryGroupBranchItemDto,
  type InventoryGroupModelItemDto,
  type InventoryStatusOption,
} from "@/features/inventory/actions/inventory.actions";
import { InventorySeriesSummaryPanel } from "@/features/inventory/components/inventory-series-summary";
import { defectApprovalBranchIds } from "@/features/inventory/lib/defect-approver";
import type { BranchInventoryV2CardAmounts } from "@/features/inventory/services/inventory.service";
import {
  branchInventoryUnitTotal,
  isBranchInventoryV2HiddenStatus,
  omitBranchInventoryV2HiddenStatusCounts,
} from "@/features/inventory/utils/branch-inventory-v2";
import { requirePermission } from "@/lib/auth/permissions";
import type { PaginatedResult } from "@/lib/shared/pagination";

interface BranchInventoryV2PageProps {
  searchParams: Promise<{
    view?: string;
    branch?: string;
    q?: string;
    status?: string;
    page?: string;
    limit?: string;
    offPlanogram?: string;
    sku?: string;
  }>;
}

type V2Screen = { kind: "all" } | { kind: "branch"; branchId: string };

function resolveV2Screen(params: { view?: string; branch?: string }): V2Screen {
  const branchId = params.branch?.trim();
  if (branchId) return { kind: "branch", branchId };
  return { kind: "all" };
}

function branchGroups(
  result: PaginatedResult<InventoryGroupBranchItemDto | InventoryGroupModelItemDto>,
): InventoryGroupBranchItemDto[] {
  return result.items.filter(
    (item): item is InventoryGroupBranchItemDto => "branch" in item,
  );
}

/** Every SKU that still has units at this branch after Sold and Official Sold are hidden. */
function modelOptionsForBranch(
  groups: PaginatedResult<InventoryGroupBranchItemDto | InventoryGroupModelItemDto>,
): { sku: string; name: string }[] {
  const bySku = new Map<string, string>();
  for (const item of groups.items) {
    if (!("model" in item)) continue;
    const visibleUnits = branchInventoryUnitTotal(
      omitBranchInventoryV2HiddenStatusCounts(item.counts),
    );
    if (visibleUnits <= 0) continue;
    if (!bySku.has(item.model.sku)) {
      bySku.set(item.model.sku, item.model.name);
    }
  }
  return [...bySku.entries()]
    .map(([sku, name]) => ({ sku, name }))
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" }));
}

/**
 * Statuses that actually have units at this branch. The serial page is not the source:
 * a filtered page would hide the rest of the menu.
 */
function statusOptionsForBranch(
  options: InventoryStatusOption[],
  branch: InventoryGroupBranchItemDto | null,
  selectedStatusId?: string,
) {
  const visibleOptions = options.filter(
    (option) => !isBranchInventoryV2HiddenStatus(option.code),
  );
  if (!branch) return visibleOptions;
  const present = new Set<string>();
  for (const status of branch.counts.statuses) {
    if (status.count > 0 && !isBranchInventoryV2HiddenStatus(status.code)) {
      present.add(status.code);
    }
  }
  for (const [code, count] of Object.entries(branch.counts.statusCounts)) {
    if (count > 0 && !isBranchInventoryV2HiddenStatus(code)) present.add(code);
  }
  if (branch.counts.notStockedIn > 0) present.add("STK");
  if (present.size === 0) return visibleOptions;
  const filtered = visibleOptions.filter(
    (option) => present.has(option.code) || option.id === selectedStatusId,
  );
  return filtered.length > 0 ? filtered : visibleOptions;
}

function withoutSoldBranchRows(
  rows: InventoryGroupBranchItemDto[],
): InventoryGroupBranchItemDto[] {
  return rows.map((row) => ({
    ...row,
    counts: omitBranchInventoryV2HiddenStatusCounts(row.counts),
  }));
}

export default async function BranchInventoryV2Page({
  searchParams,
}: BranchInventoryV2PageProps) {
  const session = await requirePermission("inventory.view");
  const params = await searchParams;
  const screen = resolveV2Screen(params);
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit ?? BRANCH_INVENTORY_V2_PAGE_SIZE);
  const q = params.q?.trim() ?? "";
  const statusCodeId = params.status?.trim() || undefined;
  const offPlanogram = params.offPlanogram === "1";
  const sku = params.sku?.trim() || undefined;

  const [kpis, seriesSummary, groupResult, offPlanogramResult, approvalBranchIds, unread, cardAmounts] =
    await Promise.all([
      getInventoryKpisAction(),
      getInventorySeriesSummaryAction(
        screen.kind === "branch" ? { branchId: screen.branchId } : undefined,
      ),
      listInventoryGroupsAction({ groupBy: "by-branch", all: true }),
      listInventoryGroupsAction({ groupBy: "by-branch", all: true, offPlanogram: true }),
      defectApprovalBranchIds(
        session.user.tenantId,
        session.user.id,
        session.user.roleSlugs,
      ),
      getBranchInventoryUnreadAction(
        screen.kind === "branch" ? { branchId: screen.branchId } : undefined,
      ),
      screen.kind === "all"
        ? getBranchInventoryV2CardAmountsAction()
        : Promise.resolve(null),
    ]);

  const branches = withoutSoldBranchRows(branchGroups(groupResult));
  const offPlanogramBranches = withoutSoldBranchRows(branchGroups(offPlanogramResult));
  const singleBranch = branches.length === 1 || session.user.roleSlugs.includes("ps");
  const seriesPanel = <InventorySeriesSummaryPanel summary={seriesSummary} />;

  return (
    <div className="space-y-6">
      {await renderScreen({
        screen,
        branches,
        offPlanogramBranches,
        totalUnits: kpis.totalUnits,
        statusCodes: kpis.statuses
          .map((status) => status.code)
          .filter((code) => !isBranchInventoryV2HiddenStatus(code)),
        cardAmounts,
        page,
        limit,
        q,
        statusCodeId,
        offPlanogram,
        sku,
        singleBranch,
        approvalBranchIds,
        unreadByCode: unread.byCode,
        unreadByBranchCode: unread.byBranchCode,
        seriesSummary: seriesPanel,
      })}
    </div>
  );
}

async function renderScreen(input: {
  screen: V2Screen;
  branches: InventoryGroupBranchItemDto[];
  offPlanogramBranches: InventoryGroupBranchItemDto[];
  totalUnits: number;
  statusCodes: string[];
  cardAmounts: BranchInventoryV2CardAmounts | null;
  page: number;
  limit: number;
  q: string;
  statusCodeId?: string;
  offPlanogram: boolean;
  sku?: string;
  singleBranch: boolean;
  approvalBranchIds: string[] | null;
  unreadByCode: Record<string, number>;
  unreadByBranchCode: Record<string, Record<string, number>>;
  seriesSummary?: ReactNode;
}) {
  const screen = input.screen;
  switch (screen.kind) {
    case "all":
      return (
        <BranchInventoryAllBranchesScreen
          branches={input.branches}
          offPlanogramBranches={input.offPlanogramBranches}
          cardAmounts={
            input.cardAmounts ?? {
              total: 0,
              inStock: 0,
              defective: 0,
              offPlanogram: 0,
            }
          }
          initialOffPlanogram={input.offPlanogram}
          unreadByBranchCode={input.unreadByBranchCode}
          seriesSummary={input.seriesSummary}
        />
      );
    case "branch": {
      const branchId = screen.branchId;
      const [statusOptions, modelGroups] = await Promise.all([
        listInventoryStatusOptionsAction({ includeDefective: true }),
        listInventoryGroupsAction({
          groupBy: "by-model",
          branchId,
          all: true,
        }),
      ]);
      const statusCodeId = statusOptions.some(
        (option) =>
          option.id === input.statusCodeId &&
          isBranchInventoryV2HiddenStatus(option.code),
      )
        ? undefined
        : input.statusCodeId;
      const result = await listInventoryAction({
        page: input.page,
        limit: input.limit,
        branchId,
        statusCodes: input.statusCodes,
        statusCodeId,
        q: input.q,
        sku: input.sku,
        offPlanogram: input.offPlanogram,
      });
      const branch = input.branches.find((row) => row.branch.id === branchId) ?? null;
      const offPlanogramRow =
        input.offPlanogramBranches.find((row) => row.branch.id === branchId) ?? null;
      const offPlanogramCount = offPlanogramRow
        ? branchInventoryUnitTotal(offPlanogramRow.counts)
        : 0;
      const unreadIds = await listUnreadBranchInventoryIdsAction(
        result.items.map((item) => item.id),
      );
      return (
        <BranchInventorySerialScreen
          key={`${branchId}:${statusCodeId ?? ""}:${input.sku ?? ""}:${input.offPlanogram ? "1" : "0"}`}
          branchId={branchId}
          branch={branch}
          result={result}
          statusOptions={statusOptionsForBranch(statusOptions, branch, statusCodeId)}
          modelOptions={modelOptionsForBranch(modelGroups)}
          q={input.q}
          statusCodeId={statusCodeId}
          sku={input.sku}
          initialOffPlanogram={input.offPlanogram}
          limit={input.limit}
          approvalBranchIds={input.approvalBranchIds}
          singleBranch={input.singleBranch}
          offPlanogramCount={offPlanogramCount}
          unreadByCode={input.unreadByCode}
          unreadIds={unreadIds}
          seriesSummary={input.seriesSummary}
        />
      );
    }
    default: {
      const unexpected: never = screen;
      return unexpected;
    }
  }
}
