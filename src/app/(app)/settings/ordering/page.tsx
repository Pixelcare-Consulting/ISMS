import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { frequencyCodeService } from "@/features/frequency-codes/services/frequency-code.service";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { OrderingPolicyForm } from "@/app/(app)/settings/ordering/_components/ordering-policy-form";
import { FrequencyCodesPanel } from "@/app/(app)/settings/ordering/_components/frequency-codes-panel";

export default async function OrderingSettingsPage() {
  const session = await requirePermission("ordering_settings.manage");
  const [policy, frequencyCodes] = await Promise.all([
    orderingPolicyService.getPolicy(session.user.tenantId),
    frequencyCodeService.list(session.user.tenantId),
  ]);
  const canEdit = hasPermission(session.user.permissions, "ordering_settings.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordering policy"
        description="Company-wide days and hours when selected order modules cannot be created, submitted, or approved, plus the reusable delivery-frequency codes branches select from."
      />
      <SettingsSection
        title="Global order lock"
        description="Choose which order modules company weekday and daily time locks apply to. They sit on top of each branch's own ordering window."
      >
        <OrderingPolicyForm
          initialLockedWeekdays={policy.globalLockedWeekdays}
          initialDailyLockEnabled={policy.dailyLockEnabled ?? false}
          initialDailyLockStartMinutes={policy.dailyLockStartMinutes ?? null}
          initialDailyLockEndMinutes={policy.dailyLockEndMinutes ?? null}
          initialLockAppliesToOrderTypes={policy.lockAppliesToOrderTypes ?? ["manual"]}
          canEdit={canEdit}
        />
      </SettingsSection>
      <SettingsSection
        title="Frequency codes"
        description="Delivery-cadence codes (e.g. F4 → once a week) reused across branches."
      >
        <FrequencyCodesPanel
          codes={frequencyCodes.map((c) => ({
            id: c.id,
            code: c.code,
            frequency: c.frequency,
            description: c.description,
            usedBy: c._count.branchSchedules,
          }))}
          canEdit={canEdit}
        />
      </SettingsSection>
    </div>
  );
}
