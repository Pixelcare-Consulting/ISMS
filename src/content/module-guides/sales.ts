import type { ModuleGuideContent } from "@/content/module-guides/types";

export const SALES_MODULE_GUIDE: ModuleGuideContent = {
  title: "Sales",
  description:
    "Encode and list branch sales (view/create). Start Process Return from View details; track evaluate → approve → restore or replacement under Returns / Replacement.",
  tips: [
    { label: "New transaction → add package details, then verify totals before save" },
    { label: "RSV reserves stock instead of marking it sold" },
    {
      label:
        "Line Edit in details is only for TO-FOLLOW serials; Accounting can Edit header fields when granted",
    },
    {
      label:
        "Request return opens Process Return (document type, STK/DEF, problems, Return or Replacement); finish under Returns / Replacement",
    },
  ],
  storageKey: "module-guide.sales",
};
