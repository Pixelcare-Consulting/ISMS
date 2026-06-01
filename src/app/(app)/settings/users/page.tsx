import {
  listDepartmentsAction,
  listRolesAction,
  listUsersAction,
} from "@/features/users/actions/user.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { UsersTable } from "@/app/(app)/settings/users/_components/users-table";

export default async function SettingsUsersPage() {
  const session = await requirePermission("users.manage");
  const [users, roles, departments] = await Promise.all([
    listUsersAction(),
    listRolesAction(),
    listDepartmentsAction(),
  ]);

  const roleOptions = roles.map((role) => ({ slug: role.slug, name: role.name }));
  const departmentOptions = departments.map((department) => ({
    id: department.id,
    name: department.name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage users in your organization."
      />
      <UsersTable
        users={users}
        roles={roleOptions}
        departments={departmentOptions}
        currentUserId={session.user.id}
      />
    </div>
  );
}
