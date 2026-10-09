import type { LookupRecordStatus } from "@prisma/client";

import {
  getSerialNumberKpisAction,
  listFlatSerialNumbersAction,
  listSerialModelOptionsAction,
  listSerialNumbersAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import { SerialNumberKpisStrip } from "@/features/serial-numbers/components/serial-number-kpis";
import {
  FLAT_SERIAL_DEFAULT_SORT,
  FLAT_SERIAL_DEFAULT_SORT_DIR,
} from "@/features/serial-numbers/constants/flat-serial-sort";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { canSyncFromSap } from "@/features/sap/constants/sap-permissions";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { SerialNumberTable } from "@/app/(app)/inventory/serial-numbers/_components/serial-number-table";
import { SerialNumberTableByModel } from "@/app/(app)/inventory/serial-numbers/_legacy/serial-number-table-by-model";

interface SerialNumbersPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    status?: string;
    sort?: string;
    dir?: string;
    /** `by-model` restores the pre-0.54.0 aggregated UI (backup under `_legacy/`). */
    view?: string;
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
  const byModel = params.view === "by-model";
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const status = parseStatus(params.status);
  const flatSort = params.sort ?? FLAT_SERIAL_DEFAULT_SORT;
  const flatSortDir = params.dir ?? FLAT_SERIAL_DEFAULT_SORT_DIR;
  const listArgs = {
    page,
    limit,
    q: params.q,
    status,
    sort: byModel ? params.sort : flatSort,
    sortDir: byModel ? params.dir : flatSortDir,
  };
  const modelOptionsPromise = canManage
    ? listSerialModelOptionsAction()
    : Promise.resolve([]);

  if (byModel) {
    const [result, modelOptions, kpis] = await Promise.all([
      listSerialNumbersAction(listArgs),
      modelOptionsPromise,
      getSerialNumberKpisAction("models"),
    ]);

    return (
      <div className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="text-muted-foreground">
            Viewing the legacy by-model list (SKU rows with quantity). The primary
            view lists every serial on its own row — use Serial list in the toolbar
            below.
          </p>
        </div>
        <SerialNumberKpisStrip kpis={kpis} mode="models" />
        <SerialNumberTableByModel
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

  const [result, modelOptions, kpis] = await Promise.all([
    listFlatSerialNumbersAction(listArgs),
    modelOptionsPromise,
    getSerialNumberKpisAction("serials"),
  ]);

  return (
    <div className="space-y-4">
      <SerialNumberKpisStrip kpis={kpis} mode="serials" />
      <SerialNumberTable
        result={result}
        modelOptions={modelOptions}
        canManage={canManage}
        canSync={canSync}
        currentSearch={params.q}
        currentStatus={status}
        initialSort={flatSort}
        initialSortDir={flatSortDir}
      />
    </div>
  );
}
