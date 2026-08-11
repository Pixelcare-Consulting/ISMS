import type { ModuleGuideContent } from "@/content/module-guides/types";

export const SALES_MODULE_GUIDE: ModuleGuideContent = {
  title: "Sales & ATR",
  description:
    "Sales tab lists branch sales (view/create). Returns tab needs View returns and tracks the ATR pipeline. Encode new sales with package detail sets and reserved (RSV) flow. Start a return from Sales → View details.",
  tips: [
    { label: "New transaction → add package details, then verify totals before save" },
    { label: "RSV reserves stock instead of marking it sold" },
    {
      label:
        "Returns tab (View returns): track requests; View details for request → evaluate → approve → restore by role",
    },
  ],
  storageKey: "module-guide.sales",
};
