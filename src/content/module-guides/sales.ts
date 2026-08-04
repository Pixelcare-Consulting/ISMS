import type { ModuleGuideContent } from "@/content/module-guides/types";

export const SALES_MODULE_GUIDE: ModuleGuideContent = {
  title: "Sales & ATR",
  description:
    "List branch sales and run ATR returns. Encode new sales with package detail sets, reserved (RSV) flow, and return requests.",
  tips: [
    { label: "New transaction → add package details, then verify totals before save" },
    { label: "RSV reserves stock instead of marking it sold" },
    { label: "ATR returns follow request → evaluate → approve by role" },
  ],
  storageKey: "module-guide.sales",
};
