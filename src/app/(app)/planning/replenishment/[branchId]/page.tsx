import { redirect } from "next/navigation";

/** Legacy Replenishment workbench — redirects to Auto Replenish. */
export default function ReplenishmentBranchRedirectPage() {
  redirect("/orders/auto-replenish");
}
