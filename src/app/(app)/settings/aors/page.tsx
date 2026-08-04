import {
  listAorFormOptionsAction,
  listAorsAction,
} from "@/features/aors/actions/aor.actions";
import { ModuleGuide } from "@/components/module-guide";
import { requirePermission } from "@/lib/auth/permissions";
import { AORS_MODULE_GUIDE } from "@/content/module-guides/aors";
import { AORS_PAGE_TUTORIAL } from "@/content/page-tutorials/aors";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { AorsKpisStrip } from "@/app/(app)/settings/aors/_components/aors-kpis";
import { AorsTable } from "@/app/(app)/settings/aors/_components/aors-table";

export default async function SettingsAorsPage() {
  await requirePermission("aors.manage");
  const [aors, options] = await Promise.all([
    listAorsAction(),
    listAorFormOptionsAction(),
  ]);

  const mappedAors = aors.map((aor) => ({
    id: aor.id,
    createdAt: aor.createdAt.toISOString(),
    user: {
      id: aor.user.id,
      name: aor.user.name,
      email: aor.user.email,
    },
    createdBy: aor.createdBy
      ? { name: aor.createdBy.name, email: aor.createdBy.email }
      : null,
    branch: aor.branch
      ? {
          id: aor.branch.id,
          name: aor.branch.name,
          sapCode: aor.branch.sapCode,
        }
      : null,
    warehouse: aor.warehouse
      ? {
          id: aor.warehouse.id,
          name: aor.warehouse.name,
          code: aor.warehouse.code,
        }
      : null,
    dealer: aor.dealer
      ? {
          id: aor.dealer.id,
          name: aor.dealer.name,
          sapCode: aor.dealer.sapCode,
        }
      : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Areas of responsibility"
        tutorial={AORS_PAGE_TUTORIAL}
        description="Assignments are stored per branch. The table groups them by user so you can see every branch in one place."
        sticky={false}
      />
      <ModuleGuide {...AORS_MODULE_GUIDE} />
      <AorsKpisStrip rows={mappedAors} />
      <AorsTable
        aors={mappedAors}
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
          dealerId: b.dealerId,
          label: `${b.name} (${b.sapCode})`,
        }))}
        dealers={options.dealers.map((d) => ({
          id: d.id,
          name: d.name,
          sapCode: d.sapCode,
          branchCount: d._count.branches,
          label: d.sapCode ? `${d.name} (${d.sapCode})` : d.name,
        }))}
        warehouses={options.warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          label: `${w.name} (${w.code})`,
        }))}
      />
    </div>
  );
}
