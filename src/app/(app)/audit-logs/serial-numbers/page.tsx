import { listSerialActivityAction } from "@/features/serial-activity/actions/serial-activity.actions";
import {
  SERIAL_ACTIVITY_TYPES,
  type SerialActivityType,
} from "@/features/serial-activity/constants/serial-activity-display";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SerialActivityTable } from "@/app/(app)/audit-logs/serial-numbers/_components/serial-activity-table";

interface SerialLogsPageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

function parseType(value?: string): SerialActivityType | undefined {
  return SERIAL_ACTIVITY_TYPES.find((t) => t === value);
}

export default async function SerialNumberLogsPage({
  searchParams,
}: SerialLogsPageProps) {
  await requirePermission("audit_logs.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const type = parseType(params.type);

  const rawResult = await listSerialActivityAction({
    page,
    type,
    q: params.q,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

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
        description="Read-only activity feed of every serialized unit — registered, transferred, sold, pulled out, counted, and status changes."
      />
      <SerialActivityTable
        result={result}
        currentType={type}
        currentSearch={params.q}
        currentDateFrom={params.dateFrom}
        currentDateTo={params.dateTo}
      />
    </div>
  );
}
