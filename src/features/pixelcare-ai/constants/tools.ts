export const PIXELCARE_AI_READ_ONLY_TOOLS = [
  "listPermittedBranches",
  "prepareReplenishmentProposal",
  "checkBranchStock",
  "explainShelfGaps",
  "findOrderStatus",
  "explainReturns",
  "explainIsmsWorkflow",
  "getDashboardSnapshot",
  "listDemandPlanningRuns",
  "getDemandPlanningRun",
  "getCoverageMonitor",
  "listAllocationGaps",
  "listDraftSuggestedOrders",
  "listBranchQuotas",
  "getPlanogramAlerts",
  "findReturnStatus",
  "getLogisticsKpis",
  "getPcountStatus",
  "listMonthlySirStatus",
  "listOpsInbox",
  "findDeliveryStatus",
  "getSapIntegrationOverview",
] as const;

export const PIXELCARE_AI_CONFIRMED_WRITE_TOOLS = ["confirmReplenishmentProposal"] as const;

export type PixelcareAiToolName =
  | (typeof PIXELCARE_AI_READ_ONLY_TOOLS)[number]
  | (typeof PIXELCARE_AI_CONFIRMED_WRITE_TOOLS)[number];

export const PIXELCARE_AI_FORBIDDEN_WRITE_TOOLS = [
  "createOrder",
  "updateOrder",
  "approveOrder",
  "submitReturn",
  "runAllocation",
  "generateSuggestedOrders",
  "delete",
] as const;
