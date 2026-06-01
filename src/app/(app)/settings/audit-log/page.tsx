import {
  getAuditLogFilterOptionsAction,
  listAuditLogsAction,
} from "@/features/audit/actions/audit-log.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { AuditLogTable } from "@/app/(app)/settings/audit-log/_components/audit-log-table";

interface AuditLogPageProps {
  searchParams: Promise<{
    page?: string;
    action?: string;
    entityType?: string;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export default async function SettingsAuditLogPage({
  searchParams,
}: AuditLogPageProps) {
  await requirePermission("reports.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const [rawResult, filterOptions] = await Promise.all([
    listAuditLogsAction({
      page,
      action: params.action,
      entityType: params.entityType,
      q: params.q,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    }),
    getAuditLogFilterOptionsAction(),
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
        title="Audit log"
        description="A clear, read-only timeline of who did what in your organization."
      />
      <AuditLogTable
        result={result}
        filterOptions={filterOptions}
        currentAction={params.action}
        currentEntityType={params.entityType}
        currentSearch={params.q}
        currentDateFrom={params.dateFrom}
        currentDateTo={params.dateTo}
      />
    </div>
  );
}
