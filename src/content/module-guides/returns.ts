import type { ModuleGuideContent } from "@/content/module-guides/types";

export const RETURNS_MODULE_GUIDE: ModuleGuideContent = {
  title: "Returns / Replacement",
  description:
    "Process customer returns after a sale. Start the request from Sales or Service Center Sales details, then finish evaluate → approve → restore here.",
  tips: [
    {
      label:
        "Branch Returns — track branch sale returns with status badges and View details",
    },
    {
      label:
        "Service Returns — evaluate, approve, reject, or restore service center returns",
    },
    {
      label:
        "Approvals — combined queue for returns waiting on CS, TL, or stock restore",
    },
    {
      label:
        "Replacement workflow is not available yet — this module covers returns only for now",
    },
  ],
  storageKey: "module-guide.returns",
};
