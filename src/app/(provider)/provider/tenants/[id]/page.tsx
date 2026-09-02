import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { EditOrganizationForm } from "@/app/(provider)/provider/tenants/_components/edit-organization-form";
import { ProviderUsersTable } from "@/app/(provider)/provider/tenants/_components/provider-users-table";
import { TenantSapServiceLayerForm } from "@/app/(provider)/provider/tenants/_components/tenant-sap-service-layer-form";
import { TenantStatusActions } from "@/app/(provider)/provider/tenants/_components/tenant-status-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getProviderCustomerDetailAction,
  listProviderCustomerUsersAction,
} from "@/features/provider/actions/provider.actions";
import { listProviderSapSettingsAction } from "@/features/provider/actions/provider-sap.actions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Tenant detail");

function formatDate(value: Date) {
  return value.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ProviderTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tenant, usersBundle, sapSettings] = await Promise.all([
    getProviderCustomerDetailAction(id),
    listProviderCustomerUsersAction(id),
    listProviderSapSettingsAction(id),
  ]);

  if (!tenant || !usersBundle) {
    notFound();
  }

  const orgDisabled = tenant.status === "disabled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        description={`Slug: ${tenant.slug}`}
        sticky={false}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={orgDisabled ? "secondary" : "default"}>
              {orgDisabled ? "Disabled" : "Active"}
            </Badge>
            <TenantStatusActions
              tenantId={tenant.id}
              tenantName={tenant.name}
              status={tenant.status}
            />
            <Button asChild variant="outline">
              <Link href="/provider/tenants">Back</Link>
            </Button>
          </div>
        }
      />

      {orgDisabled ? (
        <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This organization is disabled. Restore it before editing branding or
          managing users.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <EditOrganizationForm
            tenantId={tenant.id}
            initialName={tenant.name}
            initialTagline={tenant.tagline}
            initialLogo={tenant.logo}
            slug={tenant.slug}
            disabled={orgDisabled}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {tenant.userCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {tenant.roleCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(tenant.createdAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(tenant.updatedAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage people and Tenant Admins for this organization.
          </p>
        </div>
        <ProviderUsersTable
          tenantId={tenant.id}
          users={usersBundle.users}
          roles={usersBundle.roles}
          departments={usersBundle.departments}
          orgDisabled={orgDisabled}
        />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">SAP Service Layer</h2>
          <p className="text-sm text-muted-foreground">
            Connection credentials for this organization&apos;s SAP Business One
            Service Layer. Platform operators only — tenant administrators
            cannot view or change these.
          </p>
        </div>
        <TenantSapServiceLayerForm tenantId={tenant.id} initial={sapSettings} />
      </div>
    </div>
  );
}
