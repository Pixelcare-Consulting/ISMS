import type { ModuleGuideContent } from "@/content/module-guides/types";

export const RETURNS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Returns / Replacement",
  description:
    "Finish customer returns and replacements after a sale. Start Process Return from Sales details, then evaluate → approve → restore or complete replacement here.",
  tips: [
    {
      label:
        "Branch Returns — report columns for status, document type, Return/Replacement, serials, problem, and ATR/ODRF download",
    },
    {
      label:
        "Approved Return rows use Return to restore stock as STK or DEF (chosen at request time)",
    },
    {
      label:
        "Approved Replacement rows open Same Invoice or New Invoice to issue a unit and close the ATR",
    },
    {
      label:
        "Service Returns — evaluate, approve, reject, or restore service center returns",
    },
    {
      label:
        "Approvals — combined queue for returns waiting on CS, TL, or stock restore / replacement",
    },
    {
      label:
        "Roles can grant Branch Returns, Service Returns, and Approvals separately — or View all Returns tabs for full access",
    },
  ],
  storageKey: "module-guide.returns",
};
