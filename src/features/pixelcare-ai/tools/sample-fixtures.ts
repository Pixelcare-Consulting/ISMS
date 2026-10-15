/**
 * Sample branch label. Live tool executes still overlay a verified permitted
 * `branch.id` before returning so conversation context can sync safely.
 */
const SAMPLE_BRANCH_LABEL = {
  name: "Sample Branch",
  sapCode: "SAMP-01",
} as const;

export const SAMPLE_BRANCH_STOCK = {
  sample: true as const,
  label: "SAMPLE DATA — not live inventory",
  branch: SAMPLE_BRANCH_LABEL,
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/inventory",
  items: [
    { skuCode: "TV-55-A", name: "Sample 55\" TV", stkQty: 4, status: "STK" },
    { skuCode: "REF-200", name: "Sample Refrigerator", stkQty: 1, status: "STK" },
  ],
  nextSteps: [
    {
      label: "Open Stock units",
      href: "/inventory",
    },
    {
      label: "Open Order Analytics to restock",
      href: "/orders/manual?tab=analytics",
    },
  ],
};

export const SAMPLE_SHELF_GAPS = {
  sample: true as const,
  label: "SAMPLE DATA — not live planogram",
  branch: SAMPLE_BRANCH_LABEL,
  formula:
    "Suggested order qty / SUG = Shelf max − on-hand (STK) (= Math.max(0, Shelf max − STK))",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/orders/manual?tab=analytics",
  lines: [
    {
      skuCode: "TV-55-A",
      maxQty: 6,
      shelfMax: 6,
      stkQty: 4,
      sugQty: 2,
    },
    {
      skuCode: "REF-200",
      maxQty: 3,
      shelfMax: 3,
      stkQty: 1,
      sugQty: 2,
    },
  ],
  nextSteps: [
    {
      label: "Open Order Analytics, then Proceed to order or Create order",
      href: "/orders/manual?tab=analytics",
    },
  ],
};

export const SAMPLE_PERMITTED_BRANCHES = {
  sample: true as const,
  label: "SAMPLE DATA — not live AOR",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  total: 1,
  returned: 1,
  truncated: false,
  branches: [
    {
      id: "sample-branch",
      name: SAMPLE_BRANCH_LABEL.name,
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
    },
  ],
};

export const SAMPLE_ORDER_STATUS = {
  sample: true as const,
  label: "SAMPLE DATA — not a live order",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  orders: [
    {
      id: "sample-order",
      orderNumber: "SO-SAMPLE-001",
      status: "pending_sp",
      statusLabel: "Pending Supply Planning",
      orderType: "manual",
      branchId: "sample-branch",
      branchName: "Sample Branch",
      href: "/orders/manual",
    },
  ],
};

export const SAMPLE_DASHBOARD_SNAPSHOT = {
  sample: true as const,
  label: "SAMPLE DATA — not live dashboard",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/dashboard",
  kpis: [
    { label: "Orders waiting for review", value: 3 },
    { label: "Deliveries in transit", value: 12 },
    { label: "Open returns", value: 2 },
  ],
  thisMonth: {
    ordersThisMonth: 40,
    salesThisMonth: 120,
    deliveryInTransit: 12,
  },
  sales: null,
  nextSteps: [{ label: "Open Dashboard", href: "/dashboard" }],
};

export const SAMPLE_DEMAND_PLANNING_RUNS = {
  sample: true as const,
  label: "SAMPLE DATA — not live planning runs",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/settings/planning/runs",
  total: 1,
  returned: 1,
  runs: [
    {
      id: "sample-dp-run",
      documentNumber: "DP-SAMPLE-001",
      version: 1,
      status: "generated",
      name: "Sample October plan",
      periodLabel: "2026-10",
      branchCount: 2,
      plannedBranchCount: 2,
      createdAt: "2026-10-01T00:00:00.000Z",
      releasedAt: null,
    },
  ],
  nextSteps: [
    { label: "Open Supply Planning runs", href: "/settings/planning/runs" },
  ],
};

export const SAMPLE_DEMAND_PLANNING_RUN = {
  sample: true as const,
  label: "SAMPLE DATA — not a live planning run",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/settings/planning/runs?run=sample-dp-run",
  run: {
    id: "sample-dp-run",
    documentNumber: "DP-SAMPLE-001",
    version: 1,
    status: "generated",
    name: "Sample October plan",
    periodId: "sample-period",
    periodLabel: "2026-10",
    createdAt: "2026-10-01T00:00:00.000Z",
    releasedAt: null,
    branchCount: 2,
  },
  branches: [
    {
      id: "sample-run-branch",
      branchId: "sample-branch",
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
      name: SAMPLE_BRANCH_LABEL.name,
      planStatus: "planned",
    },
  ],
  nextSteps: [
    {
      label: "Open this planning run",
      href: "/settings/planning/runs?run=sample-dp-run",
    },
  ],
};

export const SAMPLE_COVERAGE_MONITOR = {
  sample: true as const,
  label: "SAMPLE DATA — not live coverage",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/reports/demand-planning",
  selectedPeriodId: "sample-period",
  periodLabel: "2026-10",
  isActivePeriod: true,
  run: {
    id: "sample-dp-run",
    documentNumber: "DP-SAMPLE-001",
    version: 1,
    status: "generated",
    onHandAsAt: "2026-10-01T00:00:00.000Z",
  },
  kpis: {
    branchesPlanned: 2,
    branchesInRun: 2,
    networkTargetPeso: 100000,
    plannedAllocPeso: 80000,
    plannedAllocQty: 40,
    allocationDays: 14,
    milDays: 7,
    targetDays: 30,
    totalInventoryPeso: 90000,
  },
  coverage: null,
  branches: [
    {
      branchId: "sample-branch",
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
      name: SAMPLE_BRANCH_LABEL.name,
      planStatus: "planned",
      allocQty: 20,
      drop1Qty: 10,
      milDays: 7,
      allocationDays: 14,
      targetDays: 30,
    },
  ],
  nextSteps: [
    { label: "Open coverage monitor", href: "/reports/demand-planning" },
  ],
};

export const SAMPLE_ALLOCATION_GAPS = {
  sample: true as const,
  label: "SAMPLE DATA — not live allocation gaps",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/settings/planning",
  periodId: "sample-period",
  periodLabel: "2026-10",
  total: 1,
  gaps: [
    {
      branchId: "sample-branch",
      branchName: SAMPLE_BRANCH_LABEL.name,
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
      skuCode: "TV-55-A",
      name: 'Sample 55" TV',
      shelfMax: 6,
      currentStock: 4,
      gapQty: 2,
    },
  ],
  note: "Shelf max is planogram capacity already stored on the allocation row.",
  nextSteps: [{ label: "Open Planning", href: "/settings/planning" }],
};

export const SAMPLE_DRAFT_SUGGESTED_ORDERS = {
  sample: true as const,
  label: "SAMPLE DATA — not live suggested orders",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/settings/planning",
  total: 1,
  orders: [
    {
      id: "sample-draft-order",
      orderNumber: "AR-SAMPLE-001",
      status: "draft",
      branchId: "sample-branch",
      branchName: SAMPLE_BRANCH_LABEL.name,
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
      lineCount: 2,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  nextSteps: [
    { label: "Open Planning / drafts", href: "/settings/planning" },
  ],
};

export const SAMPLE_BRANCH_QUOTAS = {
  sample: true as const,
  label: "SAMPLE DATA — not live quotas",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/settings/branch-quotas",
  total: 1,
  returned: 1,
  quotas: [
    {
      id: "sample-quota",
      branchId: "sample-branch",
      branchName: SAMPLE_BRANCH_LABEL.name,
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
      brandId: "sample-brand",
      brandName: "Sample Brand",
      month: "2026-10",
      quotaAmount: 50,
    },
  ],
  nextSteps: [
    { label: "Open Branch quotas", href: "/settings/branch-quotas" },
  ],
};

export const SAMPLE_PLANOGRAM_ALERTS = {
  sample: true as const,
  label: "SAMPLE DATA — not live planogram alerts",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/settings/planogram",
  belowCapacity: 2,
  milBreaches: 1,
  belowCapacityBranches: [
    {
      branchId: "sample-branch",
      branchName: SAMPLE_BRANCH_LABEL.name,
      count: 2,
    },
  ],
  milBreachBranches: [
    {
      branchId: "sample-branch",
      branchName: SAMPLE_BRANCH_LABEL.name,
      count: 1,
    },
  ],
  note: "belowCapacity counts SKU-branch rows where on-hand is under Shelf max.",
  nextSteps: [{ label: "Open Planogram", href: "/settings/planogram" }],
};

export const SAMPLE_RETURN_STATUS = {
  sample: true as const,
  label: "SAMPLE DATA — not a live return",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/returns",
  returns: [
    {
      id: "sample-return",
      status: "submitted",
      actionType: "replacement",
      dealerRsNo: "RS-SAMPLE-001",
      transactionNo: "TRN-SAMPLE-001",
      atrStatus: "open",
      customerName: "Sample Customer",
      branchId: "sample-branch",
      branchName: SAMPLE_BRANCH_LABEL.name,
      sapCode: SAMPLE_BRANCH_LABEL.sapCode,
      href: "/returns?focus=sample-return",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  nextSteps: [{ label: "Open Returns", href: "/returns" }],
};

export const SAMPLE_LOGISTICS_KPIS = {
  sample: true as const,
  label: "SAMPLE DATA — not live logistics",
  retrievedAt: "2026-10-15T00:00:00.000Z",
  sourceHref: "/logistics/deliveries",
  deliveries: {
    total: 5,
    statuses: [{ code: "DIT", name: "In transit", count: 3 }],
  },
  transfers: {
    total: 2,
    statuses: [{ code: "TRF", name: "Transfer", count: 2 }],
  },
  pullouts: {
    total: 1,
    statuses: [{ code: "PLO", name: "Pull-out", count: 1 }],
  },
  nextSteps: [
    { label: "Open Deliveries", href: "/logistics/deliveries" },
  ],
};
