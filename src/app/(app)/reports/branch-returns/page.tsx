import { BranchReturnReportPanel } from "@/app/(app)/reports/branch-returns/_components/branch-return-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function BranchReturnReportPage() {
  await requireAnyPermission(["reports.view", "sales.create"]);

  return <BranchReturnReportPanel />;
}
