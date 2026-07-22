import { InventoryReportPanel } from "@/app/(app)/reports/inventory/_components/inventory-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function InventoryReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Inventory stock units by branch, status, and serial number details.
      </SectionPageLead>
      <InventoryReportPanel />
    </div>
  );
}
