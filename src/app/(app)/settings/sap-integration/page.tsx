import { SapConnectionBadge } from "@/app/(app)/settings/sap-integration/_components/sap-connection-badge";
import { SapIntegrationPanel } from "@/app/(app)/settings/sap-integration/_components/sap-integration-panel";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  countSapJobsByStatusAction,
  listSapJobsAction,
} from "@/features/sap/actions/sap.actions";
import { requirePermission } from "@/lib/auth/permissions";

interface SapIntegrationPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    view?: string;
    q?: string;
  }>;
}

export default async function SapIntegrationPage({ searchParams }: SapIntegrationPageProps) {
  await requirePermission("sap.manage");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const q = params.q?.trim() || undefined;
  const [jobs, counts] = await Promise.all([
    listSapJobsAction({
      page,
      limit,
      sort: params.sort,
      sortDir: params.dir,
      view: params.view,
      q,
    }),
    countSapJobsByStatusAction(),
  ]);

  return (
    <div className="space-y-4">
      <SapConnectionBadge />
      <SapIntegrationPanel
        jobs={jobs}
        counts={counts}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
        initialView={params.view ?? ""}
        searchQuery={q ?? ""}
      />
    </div>
  );
}
