import {
  requireAuth,
  canManageCompanySettings,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { resolveTenantTagline } from "@/features/tenants/types/tenant-branding";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { CompanySettingsForm } from "@/features/settings/components/company-settings-form";
import { SettingsSection } from "@/features/settings/components/settings-section";

export default async function CompanySettingsPage() {
  const session = await requireAuth();
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
  const tenant = await tenantService.getById(session.user.tenantId);
  const canEdit = canManageCompanySettings(
    session.user.permissions,
    isPlatformOperator,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Settings"
        description="Customize your organization logo, name, and ISMS tagline shown in the sidebar."
      />
      <SettingsSection
        title="Sidebar branding"
        description="These settings update what your team sees in the left navigation."
      >
        <CompanySettingsForm
          initialValues={{
            name: tenant?.name ?? "",
            tagline: tenant?.tagline?.trim() ?? resolveTenantTagline(null),
            logo: tenant?.logo ?? null,
          }}
          slug={tenant?.slug ?? ""}
          canEdit={canEdit}
        />
      </SettingsSection>
    </div>
  );
}
