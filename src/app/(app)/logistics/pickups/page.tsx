import { listPulloutsAction } from "@/features/logistics/actions/logistics.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PulloutsPanel } from "@/app/(app)/logistics/_components/pullouts-panel";

interface PickupsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function PickupsPage({ searchParams }: PickupsPageProps) {
  await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pullouts = await listPulloutsAction({ page });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pull-outs"
        description="PS creates → TL approves → logistics schedules → branch releases → warehouse validates."
      />
      <PulloutsPanel pullouts={pullouts} />
    </div>
  );
}
