import { listReasonStatusesAction } from "@/features/reason-status/actions/reason-status.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { StatusSettingsTable } from "@/app/(app)/settings/status/_components/status-settings-table";

export default async function SettingsStatusPage() {
  await requirePermission("status_settings.manage");
  const groups = await listReasonStatusesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status settings"
        description="Reason/Status lookup tables for inventory system codes (STK, DIT, DEF), logistics workflows, and pull-out reasons."
      />
      <StatusSettingsTable groups={groups} />
    </div>
  );
}
