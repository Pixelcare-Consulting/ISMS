import type { ReactNode } from "react";

import { BranchInventoryAllBranchesScreen } from "@/app/(app)/inventory/v2/_components/all-branches-screen";
import { BranchInventorySerialScreen } from "@/app/(app)/inventory/v2/_components/serial-list-screen";
import { BRANCH_INVENTORY_V2_PAGE_SIZE } from "@/app/(app)/inventory/v2/links";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  getBranchInventoryUnreadAction,
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
import { branchInventoryUnitTotal } from "@/features/inventory/utils/branch-inventory-v2";
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

/** Every SKU that has units at this branch, independent of the serial-list filters. */
function modelOptionsForBranch(
  groups: PaginatedResult<InventoryGroupBranchItemDto | InventoryGroupModelItemDto>,
): { sku: string; name: string }[] {
  const bySku = new Map<string, string>();
  for (const item of groups.items) {
    if (!("model" in item)) continue;
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
  if (!branch) return options;
  const present = new Set<string>();
  for (const status of branch.counts.statuses) {
    if (status.count > 0) present.add(status.code);
  }
  for (const [code, count] of Object.entries(branch.counts.statusCounts)) {
    if (count > 0) present.add(code);
  }
  if (branch.counts.notStockedIn > 0) present.add("STK");
  if (present.size === 0) return options;
  const filtered = options.filter(
    (option) => present.has(option.code) || option.id === selectedStatusId,
  );
  return filtered.length > 0 ? filtered : options;
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

  const [kpis, seriesSummary, groupResult, offPlanogramResult, approvalBranchIds, unread] =
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
    ]);

  const branches = branchGroups(groupResult);
  const offPlanogramBranches = branchGroups(offPlanogramResult);
  const singleBranch = branches.length === 1 || session.user.roleSlugs.includes("ps");
  const seriesPanel = <InventorySeriesSummaryPanel summary={seriesSummary} />;

  return (
    <div className="space-y-6">
      {await renderScreen({
        screen,
        branches,
        offPlanogramBranches,
        totalUnits: kpis.totalUnits,
        statusCodes: kpis.statuses.map((status) => status.code),
        page,
        limit,
        q,
        statusCodeId,
        offPlanogram,
        sku,
        singleBranch,
        approvalBranchIds,
        unreadByCode: unread.byCode,
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
  page: number;
  limit: number;
  q: string;
  statusCodeId?: string;
  offPlanogram: boolean;
  sku?: string;
  singleBranch: boolean;
  approvalBranchIds: string[] | null;
  unreadByCode: Record<string, number>;
  seriesSummary?: ReactNode;
}) {
  const screen = input.screen;
  switch (screen.kind) {
    case "all":
      return (
        <BranchInventoryAllBranchesScreen
          branches={input.branches}
          offPlanogramBranches={input.offPlanogramBranches}
          initialOffPlanogram={input.offPlanogram}
          unreadByCode={input.unreadByCode}
          seriesSummary={input.seriesSummary}
        />
      );
    case "branch": {
      const branchId = screen.branchId;
      const [result, statusOptions, modelGroups] = await Promise.all([
        listInventoryAction({
          page: input.page,
          limit: input.limit,
          branchId,
          statusCodes: input.statusCodes,
          statusCodeId: input.statusCodeId,
          q: input.q,
          sku: input.sku,
          offPlanogram: input.offPlanogram,
        }),
        listInventoryStatusOptionsAction({ includeDefective: true }),
        listInventoryGroupsAction({
          groupBy: "by-model",
          branchId,
          all: true,
        }),
      ]);
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
          key={`${branchId}:${input.statusCodeId ?? ""}:${input.sku ?? ""}:${input.offPlanogram ? "1" : "0"}`}
          branchId={branchId}
          branch={branch}
          result={result}
          statusOptions={statusOptionsForBranch(statusOptions, branch, input.statusCodeId)}
          modelOptions={modelOptionsForBranch(modelGroups)}
          q={input.q}
          statusCodeId={input.statusCodeId}
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
