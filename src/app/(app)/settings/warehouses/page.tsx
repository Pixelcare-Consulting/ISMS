import { listWarehousesAction } from "@/features/warehouses/actions/warehouse.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { WAREHOUSES_PAGE_TUTORIAL } from "@/content/page-tutorials/warehouses";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  WarehousesSettingsTabs,
  type WarehousesTab,
} from "@/app/(app)/settings/warehouses/_components/warehouses-settings-tabs";

interface SettingsWarehousesPageProps {
  searchParams: Promise<{ tab?: string }>;
}

function parseTab(value?: string): WarehousesTab {
  return value === "stock" ? "stock" : "setup";
}

export default async function SettingsWarehousesPage({
  searchParams,
}: SettingsWarehousesPageProps) {
  await requirePermission("warehouses.manage");
  const params = await searchParams;
  const warehouses = await listWarehousesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        tutorial={WAREHOUSES_PAGE_TUTORIAL}
        description="Manage warehouse locations and storage aisles, or open warehouse stock serials (CSV step 4)."
        sticky={false}
      />
      <WarehousesSettingsTabs
        warehouses={warehouses}
        activeTab={parseTab(params.tab)}
      />
    </div>
  );
}
