"use server";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import type { SalesListSort } from "@/features/sales/repositories/sales.repository";
import { toSaleDetailsPayload } from "@/features/sales/services/sale-details-payload";
import { computeSalesKpis } from "@/features/sales/services/sales-kpi.service";
import { listSalesLines } from "@/features/sales/services/sales-list.service";
import { SC_SALES_ACCESS } from "@/features/service-center-ops/constants/sc-permissions";
import { scSalesRepository } from "@/features/service-center-ops/repositories/sc-sales.repository";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * Service center sales, read only: Sales Transactions → Service Center tab. Every row is a copy
 * of a branch sale whose Service Return / Replacement went to that service center (plus older
 * sales encoded at a service center). Nothing is encoded or edited here; the copy is written by
 * `scServiceReturnService.requestFromBranchSale` and moved on by the SC Returns steps.
 */

const SC_SALES_SORT_FIELDS = new Set<SalesListSort>([
  "transactionNo",
  "date",
  "branch",
  "customer",
  "amount",
  "atrStatus",
  "returnStatus",
]);

async function scScopeForSession(session: {
  user: { tenantId: string; id: string; permissions?: string[] };
}) {
  return resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
}

export async function listScSalesAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
  status?: string;
  q?: string;
}) {
  const session = await requireAnyPermission([...SC_SALES_ACCESS]);
  const tenantId = session.user.tenantId;
  const scopedIds = await scScopeForSession(session);
  const field = input?.sort as SalesListSort | undefined;
  return listSalesLines(
    {
      listLines: (pagination, sort) =>
        scSalesRepository.listLines(tenantId, scopedIds, pagination, sort),
      listStatusSources: (sort) =>
        scSalesRepository.listStatusSources(tenantId, scopedIds, sort),
      listLinesByIds: (ids) => scSalesRepository.listLinesByIds(tenantId, scopedIds, ids),
    },
    {
      tenantId,
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
      sort: {
        field: field && SC_SALES_SORT_FIELDS.has(field) ? field : undefined,
        dir: input?.sortDir === "asc" || input?.sortDir === "desc" ? input.sortDir : undefined,
      },
      status: input?.status,
      q: input?.q,
    },
  );
}

export async function getScSalesKpisAction(q?: string) {
  const session = await requireAnyPermission([...SC_SALES_ACCESS]);
  const scopedIds = await scScopeForSession(session);
  const sources = await scSalesRepository.listStatusSources(session.user.tenantId, scopedIds);
  return computeSalesKpis(session.user.tenantId, sources, q);
}

export async function getScSaleDetailsAction(saleId: string) {
  const session = await requireAnyPermission([...SC_SALES_ACCESS]);
  const scopedIds = await scScopeForSession(session);
  const sale = await scSalesRepository.findSaleDetails(
    session.user.tenantId,
    scopedIds,
    saleId,
  );
  if (!sale) return { error: "Sale not found" as const };
  return toSaleDetailsPayload(session.user.tenantId, sale);
}

