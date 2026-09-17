import {
  listDepartmentsAction,
  listRolesAction,
  listUsersAction,
} from "@/features/users/actions/user.actions";
import {
  filterTenantVisibleRoles,
  filterTenantVisibleUsers,
} from "@/features/roles/constants/role.constants";
import { requirePermission } from "@/lib/auth/permissions";
import { USERS_PAGE_TUTORIAL } from "@/content/page-tutorials/users";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { UsersTable } from "@/app/(app)/settings/users/_components/users-table";

export default async function SettingsUsersPage() {
  const session = await requirePermission("users.manage");
  const [users, roles, departments] = await Promise.all([
    listUsersAction(),
    listRolesAction(),
    listDepartmentsAction(),
  ]);

  const roleOptions = filterTenantVisibleRoles(roles).map((role) => ({
    slug: role.slug,
    name: role.name,
  }));
  const visibleUsers = filterTenantVisibleUsers(users);
  const departmentOptions = departments.map((department) => ({
    id: department.id,
    name: department.name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        tutorial={USERS_PAGE_TUTORIAL}
        description="Manage users in your organization."
        sticky={false}
      />
      <UsersTable
        users={visibleUsers}
        roles={roleOptions}
        departments={departmentOptions}
        currentUserId={session.user.id}
      />
    </div>
  );
}
