import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { OrderingPolicyForm } from "@/app/(app)/settings/ordering/_components/ordering-policy-form";

export default async function OrderingSettingsPage() {
  const session = await requirePermission("ordering_settings.manage");
  const policy = await orderingPolicyService.getPolicy(session.user.tenantId);
  const canEdit = hasPermission(session.user.permissions, "ordering_settings.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordering policy"
        description="Company-wide days when branch orders cannot be created, submitted, or approved. Per-branch delivery windows are configured on each branch."
      />
      <SettingsSection
        title="Global order lock"
        description="Applies on top of each branch's own ordering window."
      >
        <OrderingPolicyForm
          initialLockedWeekdays={policy.globalLockedWeekdays}
          canEdit={canEdit}
        />
      </SettingsSection>
    </div>
  );
}
