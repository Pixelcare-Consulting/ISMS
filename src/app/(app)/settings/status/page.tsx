import { listReasonStatusesAction } from "@/features/reason-status/actions/reason-status.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { StatusSettingsTable } from "@/app/(app)/settings/status/_components/status-settings-table";
import { STATUS_SETTINGS_PAGE_TUTORIAL } from "@/content/page-tutorials/status";

export default async function SettingsStatusPage() {
  await requirePermission("status_settings.manage");
  const groups = await listReasonStatusesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status settings"
        description="Codes and badge colors for Inventory and Logistics. Open each tab to see which module uses it."
        sticky={false}
        tutorial={STATUS_SETTINGS_PAGE_TUTORIAL}
      />
      <StatusSettingsTable groups={groups} />
    </div>
  );
}
