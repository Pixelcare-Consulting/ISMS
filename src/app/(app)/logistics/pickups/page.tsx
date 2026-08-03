import {
  getPulloutKpisAction,
  listPulloutsAction,
} from "@/features/logistics/actions/logistics.actions";
import { LOGISTICS_PAGE_PERMISSIONS } from "@/features/logistics/constants/logistics-permissions";
import { PulloutKpisStrip } from "@/features/logistics/components/pullout-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { PulloutsPanel } from "@/app/(app)/logistics/_components/pullouts-panel";

interface PickupsPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function PickupsPage({ searchParams }: PickupsPageProps) {
  await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [pullouts, kpis] = await Promise.all([
    listPulloutsAction({ page, limit }),
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
