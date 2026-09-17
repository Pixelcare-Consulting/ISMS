import { redirect } from "next/navigation";

import { DEMAND_PLANNING_RUNS_PATH } from "@/features/demand-planning/lib/paths";

/** Legacy shelf-gap suggested-orders URL — Demand Planning is the working home. */
export default function SuggestedOrdersRedirectPage() {
  redirect(DEMAND_PLANNING_RUNS_PATH);
}
