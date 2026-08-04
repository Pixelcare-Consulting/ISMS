import type { ReasonStatusCategory } from "@prisma/client";

import { REASON_STATUS_CATEGORY_USED_IN } from "@/features/reason-status/constants/defaults";
import type { ModuleGuideContent } from "@/content/module-guides/types";

const STATUS_TIPS: ModuleGuideContent["tips"] = [
  { label: "System codes stay — deactivate instead of delete" },
  { label: "Badge colors show on Inventory, Logistics, and Sales" },
];

/** Per-category Module Guide copy for Status settings tabs. */
export function statusModuleGuideForCategory(
  category: ReasonStatusCategory,
  name: string,
  codeCount: number,
): ModuleGuideContent {
  return {
    title: name,
    description: REASON_STATUS_CATEGORY_USED_IN[category],
    badge: `${codeCount} codes`,
    tips: STATUS_TIPS,
  };
}
