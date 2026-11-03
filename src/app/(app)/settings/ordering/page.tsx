import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { frequencyCodeService } from "@/features/frequency-codes/services/frequency-code.service";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { OrderingPolicyForm } from "@/app/(app)/settings/ordering/_components/ordering-policy-form";
import { FrequencyCodesPanel } from "@/app/(app)/settings/ordering/_components/frequency-codes-panel";
import { ServiceCenterOrderingPanel } from "@/app/(app)/settings/ordering/_components/service-center-ordering-panel";
import { SapSalesOrderImportForm } from "@/app/(app)/settings/ordering/_components/sap-sales-order-import-form";
import { scOrderingSettingsService } from "@/features/service-center-ordering/services/sc-ordering-settings.service";

export default async function OrderingSettingsPage() {
  const session = await requirePermission("ordering_settings.manage");
  const [policy, frequencyCodes, scOrdering, sapSoImportSince] = await Promise.all([
    orderingPolicyService.getPolicy(session.user.tenantId),
    frequencyCodeService.list(session.user.tenantId),
    scOrderingSettingsService.get(session.user.tenantId),
    orderingPolicyService.getSapSoImportSince(session.user.tenantId),
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
      <SettingsSection
        title="Service center ordering"
        description="Who a service center Sales Order bills and the SAP codes on its lines."
      >
        <ServiceCenterOrderingPanel
          customers={scOrdering.customers}
          defaults={scOrdering.defaults}
          canEdit={canEdit}
        />
      </SettingsSection>
      <SettingsSection
        title="Sales Orders made in SAP"
        description="SOs created directly in SAP for an ISMS branch, shipping from an ISMS warehouse, come in as approved orders marked SAP. Their DRs then reach the branch like any other."
      >
        <SapSalesOrderImportForm initialSince={sapSoImportSince} canEdit={canEdit} />
      </SettingsSection>
    </div>
  );
}
