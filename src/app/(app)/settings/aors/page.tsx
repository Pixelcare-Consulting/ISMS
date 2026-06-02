import {
  listAorFormOptionsAction,
  listAorsAction,
} from "@/features/aors/actions/aor.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { AorsTable } from "@/app/(app)/settings/aors/_components/aors-table";

export default async function SettingsAorsPage() {
  await requirePermission("aors.manage");
  const [aors, options] = await Promise.all([
    listAorsAction(),
    listAorFormOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Areas of responsibility"
        description="Scope users to branches for inventory and order visibility."
      />
      <AorsTable
        aors={aors}
        users={options.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          label: u.name ?? u.email,
        }))}
        branches={options.branches.map((b) => ({
          id: b.id,
          name: b.name,
          sapCode: b.sapCode,
          label: `${b.name} (${b.sapCode})`,
        }))}
      />
    </div>
  );
}
