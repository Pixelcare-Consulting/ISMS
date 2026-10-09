import type { LookupRecordStatus } from "@prisma/client";

import {
  getSerialNumberKpisAction,
  listSerialModelOptionsAction,
  listSerialNumbersAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import { SerialNumberKpisStrip } from "@/features/serial-numbers/components/serial-number-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { canSyncFromSap } from "@/features/sap/constants/sap-permissions";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { SerialNumberTable } from "@/app/(app)/inventory/serial-numbers/_components/serial-number-table";

interface SerialNumbersPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}

function parseStatus(value?: string): LookupRecordStatus | undefined {
  return value === "active" || value === "inactive" ? value : undefined;
}

export default async function SerialNumbersPage({
  searchParams,
}: SerialNumbersPageProps) {
  const session = await requirePermission("inventory.view");
  const permissions = session.user.permissions;
  const canManage = hasPermission(permissions, "inventory.manage");
  const canSync = canSyncFromSap(permissions);

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const status = parseStatus(params.status);

  const [result, modelOptions, kpis] = await Promise.all([
    listSerialNumbersAction({
      page,
      limit,
      q: params.q,
      status,
      sort: params.sort,
      sortDir: params.dir,
    }),
    canManage ? listSerialModelOptionsAction() : Promise.resolve([]),
    getSerialNumberKpisAction(),
  ]);

  return (
    <div className="space-y-4">
      <SerialNumberKpisStrip kpis={kpis} />
      <SerialNumberTable
        result={result}
        modelOptions={modelOptions}
        canManage={canManage}
        canSync={canSync}
        currentSearch={params.q}
        currentStatus={status}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "asc"}
      />
    </div>
  );
}
