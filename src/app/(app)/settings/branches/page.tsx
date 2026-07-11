import { listBranchesAction } from "@/features/branches/actions/branch.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { BRANCHES_PAGE_TUTORIAL } from "@/content/page-tutorials/branches";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { BranchesTable } from "@/app/(app)/settings/branches/_components/branches-table";

export default async function SettingsBranchesPage() {
  await requirePermission("branches.manage");
  const branches = await listBranchesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        tutorial={BRANCHES_PAGE_TUTORIAL}
        description="Manage dealer branch locations, SAP codes, and delivery areas."
      />
      <BranchesTable branches={branches} />
    </div>
  );
}
