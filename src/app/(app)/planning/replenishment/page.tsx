import { redirect } from "next/navigation";

/** Legacy Replenishment matrix — workbench removed; drafts live under Auto Replenish. */
export default function ReplenishmentRedirectPage() {
  redirect("/orders/auto-replenish");
}
