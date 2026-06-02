import { listTransfersAction } from "@/features/logistics/actions/logistics.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
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
    <div className="space-y-4">
      <SectionPageLead>
        PS requests → TL approves → logistics executes → receiving branch accepts.
      </SectionPageLead>
      <TransfersPanel transfers={transfers} />
    </div>
  );
}
