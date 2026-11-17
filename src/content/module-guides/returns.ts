import type { ModuleGuideContent } from "@/content/module-guides/types";

export const RETURNS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Returns / Replacement",
  description:
    "Finish customer returns and replacements after a sale. Start Process Return from Sales details. Dealer Initiated Return / Replacement waits for Team Leader. Other sales returns are approved when requested. Service Return and Service Replacement go to the chosen service center, which inspects the unit and finishes them under Service → SC Returns. Service center sale returns are still evaluated by Customer Service.",
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
        "Service Returns: track Service Returns / Replacements sent to a service center, and evaluate, approve, reject, or restore service center sale returns",
    },
    {
      label:
        "Approvals — Dealer Initiated sales returns waiting on Team Leader, service center returns waiting on Customer Service, and approved rows ready to restore or replace",
    },
    {
      label:
        "Roles can grant Branch Returns, Service Returns, and Approvals separately — or View all Returns tabs for full access",
    },
  ],
  storageKey: "module-guide.returns",
};
