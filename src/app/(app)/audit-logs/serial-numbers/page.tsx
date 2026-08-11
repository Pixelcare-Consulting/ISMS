import { getSerialActivityKpisAction, listSerialActivityAction } from "@/features/serial-activity/actions/serial-activity.actions";
import { SerialActivityKpisStrip } from "@/features/serial-activity/components/serial-activity-kpis";
import {
  SERIAL_ACTIVITY_TYPES,
  type SerialActivityType,
} from "@/features/serial-activity/constants/serial-activity-display";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SerialActivityTable } from "@/app/(app)/audit-logs/serial-numbers/_components/serial-activity-table";

interface SerialLogsPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    type?: string;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    dir?: string;
  }>;
}

function parseType(value?: string): SerialActivityType | undefined {
  return SERIAL_ACTIVITY_TYPES.find((t) => t === value);
}

export default async function SerialNumberLogsPage({
  searchParams,
}: SerialLogsPageProps) {
  await requirePermission("serial_logs.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const type = parseType(params.type);

  const [rawResult, kpis] = await Promise.all([
    listSerialActivityAction({
      page,
      limit,
      type,
      q: params.q,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      sortDir: params.dir,
    }),
    getSerialActivityKpisAction(),
  ]);

  const result = {
    items: rawResult.items,
    total: rawResult.total,
    page: rawResult.page,
    pageSize: rawResult.limit,
    totalPages: rawResult.totalPages,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serial Number Logs"
        description="Read-only activity feed of every serialized unit — registered, transferred, sold, Official Sales (ADD / DEL / WHSE_ADD), pulled out, counted, and status changes."
        sticky={false}
      />
      <SerialActivityKpisStrip kpis={kpis} />
      <SerialActivityTable
        result={result}
        currentType={type}
        currentSearch={params.q}
        currentDateFrom={params.dateFrom}
        currentDateTo={params.dateTo}
        initialSortDir={params.dir ?? "desc"}
      />
    </div>
  );
}
