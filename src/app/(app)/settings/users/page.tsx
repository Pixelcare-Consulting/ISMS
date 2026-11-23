import {
  listDepartmentsAction,
  listRolesAction,
  listUsersAction,
} from "@/features/users/actions/user.actions";
import { permissionAreaName } from "@/features/users/lib/permission-area";
import {
  filterTenantVisibleRoles,
  filterTenantVisibleUsers,
} from "@/features/roles/constants/role.constants";
import { tenantRepository } from "@/features/tenants/repositories/tenant.repository";
import { requirePermission } from "@/lib/auth/permissions";
import { USERS_PAGE_TUTORIAL } from "@/content/page-tutorials/users";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { UsersTable } from "@/app/(app)/settings/users/_components/users-table";

export default async function SettingsUsersPage() {
  const session = await requirePermission("users.manage");
  const [users, roles, departments, hideSystemRoles] = await Promise.all([
    listUsersAction(),
    listRolesAction(),
    listDepartmentsAction(),
    tenantRepository.getHideSystemRolesOnUsers(session.user.tenantId),
  ]);

  const roleOptions = filterTenantVisibleRoles(roles).map((role) => ({
    slug: role.slug,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.rolePermissions.map((rolePermission) => ({
      name: rolePermission.permission.name,
      area: permissionAreaName(rolePermission.permission.slug),
    })),
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
        hideSystemRoles={hideSystemRoles}
        currentUserId={session.user.id}
      />
    </div>
  );
}
