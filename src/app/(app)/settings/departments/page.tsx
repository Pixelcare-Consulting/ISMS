import { listDepartmentsManageAction } from "@/features/users/actions/department.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { DepartmentsTable } from "@/app/(app)/settings/departments/_components/departments-table";

export default async function SettingsDepartmentsPage() {
  await requirePermission("users.manage");
  const departments = await listDepartmentsManageAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Organize users by department. Default departments are created when you register a new organization."
      />
      <DepartmentsTable departments={departments} />
    </div>
  );
}
