import { InventoryReportPanel } from "@/app/(app)/reports/inventory/_components/inventory-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function InventoryReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return <InventoryReportPanel />;
}
