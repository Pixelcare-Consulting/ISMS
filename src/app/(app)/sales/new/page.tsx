import { PageHeader } from "@/app/(app)/_components/page-header";
import { NewSalesTransactionForm } from "@/app/(app)/sales/_components/new-sales-transaction-form";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";

export default async function NewSalesTransactionPage() {
  const session = await requirePermission("sales.create");

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

  const autoResolveBranch = roleSlugs.includes("ps") && branches.length === 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New sales transaction"
        sticky={false}
        description="Enter header details, add package line sets, then save to update stock."
      />
      <NewSalesTransactionForm
        branches={branches}
        autoResolveBranch={autoResolveBranch}
      />
    </div>
  );
}
