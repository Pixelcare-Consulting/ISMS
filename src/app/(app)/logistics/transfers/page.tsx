import { listTransfersAction } from "@/features/logistics/actions/logistics.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { TransfersPanel } from "@/app/(app)/logistics/_components/transfers-panel";

interface TransfersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const transfers = await listTransfersAction({ page });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="PS requests → TL approves → logistics executes → receiving branch accepts."
      />
      <TransfersPanel transfers={transfers} />
    </div>
  );
}
