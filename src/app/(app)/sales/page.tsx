import { listSalesAction } from "@/features/sales/actions/sales.actions";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";

interface SalesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requirePermission("sales.create");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const result = await listSalesAction({ page, limit });

  const roleSlugs = session.user.roleSlugs ?? [];
  const unrestricted =
    hasPermission(session.user.permissions, "branches.manage") ||
    hasPermission(session.user.permissions, "master_data.manage");

  let branches: { id: string; name: string }[];
  if (unrestricted) {
    const all = await branchService.listActiveBranches(session.user.tenantId);
    branches = all.map((b) => ({ id: b.id, name: b.name }));
  } else {
    const aors = await aorService.listAorsForUser(
      session.user.tenantId,
      session.user.id,
    );
    const byId = new Map<string, string>();
    for (const aor of aors) {
      if (aor.branch?.id) {
        byId.set(aor.branch.id, aor.branch.name);
      }
    }
    branches = [...byId.entries()].map(([id, name]) => ({ id, name }));
  }

  /** PS with a single AOR branch: encode without branch picker. */
  const autoResolveBranch = roleSlugs.includes("ps") && branches.length === 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & ATR"
        sticky={false}
        tutorial={SALES_PAGE_TUTORIAL}
        description="Branch sales with SN picker, reserved (RSV) flow, and ATR return workflow."
      />
      <SalesTable
        result={result}
        roleSlugs={roleSlugs}
        branches={branches}
        autoResolveBranch={autoResolveBranch}
      />
    </div>
  );
}
