import { getModuleNavPermission } from "@/config/app-modules";
import { hasPermission, requireAuth, requirePermission } from "@/lib/auth/permissions";
import { listUsersAction } from "@/features/users/actions/user.actions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { getDashboardKpisAction } from "@/features/dashboard/actions/dashboard-kpi.actions";
import { DashboardOpsKpis } from "@/app/(app)/dashboard/_components/dashboard-ops-kpis";
import { DashboardStats } from "@/app/(app)/dashboard/_components/dashboard-stats";
import { DashboardRecentUsers } from "@/app/(app)/dashboard/_components/dashboard-recent-users";

export default async function DashboardPage() {
  const dashboardPermission = getModuleNavPermission("dashboard");
  const session = dashboardPermission
    ? await requirePermission(dashboardPermission)
    : await requireAuth();
  const canManageUsers = hasPermission(session.user.permissions, "users.manage");
  const users = canManageUsers
    ? (await listUsersAction()).slice(0, 5)
    : [];
  const opsKpis = await getDashboardKpisAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${session.user.name ?? session.user.email}.`}
      />
      {opsKpis ? <DashboardOpsKpis kpis={opsKpis} /> : null}
      <DashboardStats permissions={session.user.permissions} />
      {canManageUsers ? <DashboardRecentUsers users={users} /> : null}
    </div>
  );
}
