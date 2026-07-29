import {
  getPulloutKpisAction,
  listPulloutsAction,
} from "@/features/logistics/actions/logistics.actions";
import { PulloutKpisStrip } from "@/features/logistics/components/pullout-kpis";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { PulloutsPanel } from "@/app/(app)/logistics/_components/pullouts-panel";

interface PickupsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function PickupsPage({ searchParams }: PickupsPageProps) {
  await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const [pullouts, kpis] = await Promise.all([
    listPulloutsAction({ page }),
    getPulloutKpisAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        PS creates → TL approves → logistics schedules → branch releases → warehouse validates.
      </SectionPageLead>
      <PulloutKpisStrip kpis={kpis} />
      <PulloutsPanel pullouts={pullouts} />
    </div>
  );
}
