import type { ResultTableProps } from "@/features/pixelcare-ai/components/result-table";

const TABLE_TOOLS = [
  "checkBranchStock",
  "explainShelfGaps",
  "findOrderStatus",
  "listPermittedBranches",
  "listDemandPlanningRuns",
  "listAllocationGaps",
  "listDraftSuggestedOrders",
  "listBranchQuotas",
  "findReturnStatus",
  "getPlanogramAlerts",
] as const;

type TableToolName = (typeof TABLE_TOOLS)[number];

function isTableToolName(name: string): name is TableToolName {
  return (TABLE_TOOLS as readonly string[]).includes(name);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRowArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

/**
 * Build a display-only table from known tool payloads so the UI always shows
 * readable rows even when the model formats poorly (space-padded columns).
 */
export function tableFromToolOutput(
  toolName: string,
  output: unknown,
): ResultTableProps | null {
  if (!isTableToolName(toolName)) return null;

  const data = asRecord(output);
  if (!data || typeof data.error === "string") return null;

  switch (toolName) {
    case "checkBranchStock": {
      const rows = asRowArray(data.items);
      if (rows.length === 0) return null;
      const hasAvailable = rows.some((row) => row.availableQty !== undefined);
      const hasDef = rows.some((row) => row.defQty !== undefined);
      const hasStatus = rows.some((row) => row.status !== undefined);
      return {
        caption: "Branch stock",
        columns: [
          { key: "skuCode", label: "SKU", mono: true },
          { key: "name", label: "Name", wrap: true },
          { key: "stkQty", label: "STK", align: "right" },
          ...(hasAvailable
            ? [{ key: "availableQty", label: "Available", align: "right" as const }]
            : []),
          ...(hasDef
            ? [{ key: "defQty", label: "Defective", align: "right" as const }]
            : []),
          ...(hasStatus && !hasAvailable
            ? [{ key: "status", label: "Status" }]
            : []),
        ],
        rows,
      };
    }
    case "explainShelfGaps": {
      const rows = asRowArray(data.lines).map((row) => ({
        ...row,
        shelfMax: row.shelfMax ?? row.maxQty,
      }));
      if (rows.length === 0) return null;
      return {
        caption: "Shelf gaps (SUG)",
        columns: [
          { key: "skuCode", label: "SKU", mono: true },
          { key: "name", label: "Name", wrap: true },
          { key: "shelfMax", label: "Shelf max", align: "right" },
          { key: "stkQty", label: "STK", align: "right" },
          { key: "sugQty", label: "SUG", align: "right" },
        ],
        rows,
      };
    }
    case "findOrderStatus": {
      const rows = asRowArray(data.orders);
      if (rows.length === 0) return null;
      return {
        caption: "Orders",
        columns: [
          { key: "orderNumber", label: "Order #", mono: true },
          { key: "statusLabel", label: "Status" },
          { key: "orderType", label: "Type" },
          { key: "branchName", label: "Branch", wrap: true },
        ],
        rows,
      };
    }
    case "listPermittedBranches": {
      const rows = asRowArray(data.branches);
      if (rows.length === 0) return null;
      return {
        caption: "Your branches",
        columns: [
          { key: "name", label: "Branch", wrap: true },
          { key: "sapCode", label: "SAP", mono: true },
        ],
        rows,
      };
    }
    case "listDemandPlanningRuns": {
      const rows = asRowArray(data.runs);
      if (rows.length === 0) return null;
      return {
        caption: "Planning runs",
        columns: [
          { key: "documentNumber", label: "Document", mono: true },
          { key: "periodLabel", label: "Period" },
          { key: "status", label: "Status" },
          { key: "plannedBranchCount", label: "Planned", align: "right" },
        ],
        rows,
      };
    }
    case "listAllocationGaps": {
      const rows = asRowArray(data.gaps);
      if (rows.length === 0) return null;
      return {
        caption: "Allocation gaps",
        columns: [
          { key: "skuCode", label: "SKU", mono: true },
          { key: "name", label: "Name", wrap: true },
          { key: "branchName", label: "Branch", wrap: true },
          { key: "shelfMax", label: "Shelf max", align: "right" },
          { key: "currentStock", label: "Stock", align: "right" },
          { key: "gapQty", label: "Gap", align: "right" },
        ],
        rows,
      };
    }
    case "listDraftSuggestedOrders": {
      const rows = asRowArray(data.orders);
      if (rows.length === 0) return null;
      return {
        caption: "Draft suggested orders",
        columns: [
          { key: "orderNumber", label: "Order #", mono: true },
          { key: "branchName", label: "Branch", wrap: true },
          { key: "status", label: "Status" },
          { key: "lineCount", label: "Lines", align: "right" },
        ],
        rows,
      };
    }
    case "listBranchQuotas": {
      const rows = asRowArray(data.quotas);
      if (rows.length === 0) return null;
      return {
        caption: "Branch quotas",
        columns: [
          { key: "branchName", label: "Branch", wrap: true },
          { key: "brandName", label: "Brand" },
          { key: "month", label: "Month", mono: true },
          { key: "quotaAmount", label: "Quota", align: "right" },
        ],
        rows,
      };
    }
    case "findReturnStatus": {
      const rows = asRowArray(data.returns);
      if (rows.length === 0) return null;
      return {
        caption: "Returns",
        columns: [
          { key: "transactionNo", label: "Txn #", mono: true },
          { key: "dealerRsNo", label: "RS #", mono: true },
          { key: "status", label: "Status" },
          { key: "atrStatus", label: "ATR" },
          { key: "branchName", label: "Branch", wrap: true },
        ],
        rows,
      };
    }
    case "getPlanogramAlerts": {
      const below = asRowArray(data.belowCapacityBranches).map((row) => ({
        ...row,
        alertType: "Below Shelf max",
      }));
      const mil = asRowArray(data.milBreachBranches).map((row) => ({
        ...row,
        alertType: "MIL",
      }));
      const rows = [...below, ...mil];
      if (rows.length === 0) return null;
      return {
        caption: "Planogram alerts",
        columns: [
          { key: "alertType", label: "Alert" },
          { key: "branchName", label: "Branch", wrap: true },
          { key: "count", label: "Count", align: "right" },
        ],
        rows,
      };
    }
    default: {
      const _exhaustive: never = toolName;
      return _exhaustive;
    }
  }
}
