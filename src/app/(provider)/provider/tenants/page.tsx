import { PageHeader } from "@/app/(app)/_components/page-header";
import { CreateTenantDialog } from "@/app/(provider)/provider/tenants/_components/create-tenant-dialog";
import { ProviderTenantsTable } from "@/app/(provider)/provider/tenants/_components/provider-tenants-table";
import { listProviderCustomersAction } from "@/features/provider/actions/provider.actions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Provider tenants");

export default async function ProviderTenantsPage() {
  const tenants = await listProviderCustomersAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="Create customer organizations, filter by status, and disable or restore access."
        sticky={false}
        actions={<CreateTenantDialog />}
      />
      <ProviderTenantsTable
        tenants={tenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          userCount: tenant.userCount,
          createdAt: tenant.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
