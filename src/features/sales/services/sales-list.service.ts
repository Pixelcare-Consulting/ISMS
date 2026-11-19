import {
  parseSalesListStatusFilter,
  salesListStatusCodesMatch,
} from "@/features/sales/constants/sales-list-status";
import { wasLineForSameInvoiceReplacement } from "@/features/sales/utils/replacement-unit-label";
import {
  loadSalesAtrCodesByCode,
  resolveListedLineStatus,
  resolveToFollowStatusCode,
  type ListedLineStatusDetail,
  type ListedLineStatusSale,
  type SaleStatusCodeRef,
} from "@/features/sales/utils/resolve-line-status";
import {
  matchesSalesListSearch,
  type SalesListSearchSource,
} from "@/features/sales/utils/sales-list-search";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
} from "@/lib/shared/pagination";

/**
 * Sales list (one row per sale line) shared by every stock source. Each source's
 * repository returns lines in this shape: `branch` is the sold place (branch or service
 * center) and `stockSourceBranch` the stock source (alternate branch or SC location).
 */

interface MoneyLike {
  toString(): string;
}

interface PlaceRef {
  id: string;
  name: string;
}

export interface SalesListLine {
  id: string;
  serialNumberId: string | null;
  saleAmount: MoneyLike | null;
  amount: MoneyLike | null;
  modelPrice: MoneyLike | null;
  statusCode: { code: string; name: string; color: string | null } | null;
  serialNumber: { id: string; serialNo: string } | null;
  packageType: { name: string } | null;
  brand: { name: string } | null;
  model: { skuCode: string; name: string } | null;
  sale: {
    id: string;
    transactionNo: string;
    transactionDate: Date | null;
    customerName: string | null;
    atrStatus: string;
    branchId: string;
    alternateBranchId: string | null;
    branch: PlaceRef;
    stockSourceBranch: PlaceRef | null;
    returnRequest: {
      id: string;
      status: string;
      saleDetailId: string | null;
      documentType: { name: string } | null;
    } | null;
    /** Present on branch sales. Service-center lines omit it. */
    replacements?: Array<{
      originalInvoiceNo: string | null;
      replacementInvoiceNo: string | null;
      originalSerialNumber: {
        serialNo: string;
        model: {
          skuCode: string;
          name: string;
          brand: { name: string } | null;
        } | null;
      } | null;
      replacementSerialNumber: { id: string; serialNo: string } | null;
    }>;
  };
}

/** Fields STATUS and the search box need, loaded for every line before paging. */
export type SalesLineStatusSource = ListedLineStatusDetail &
  SalesListSearchSource & { sale: ListedLineStatusSale & SalesListSearchSource["sale"] };

export type SalesListSortInput<TSort extends string> = {
  field?: TSort;
  dir?: "asc" | "desc";
};

export interface SalesLineReader<TSort extends string> {
  listLines(
    pagination: { page?: number; limit?: number },
    sort: SalesListSortInput<TSort>,
  ): Promise<PaginatedResult<SalesListLine>>;
  listStatusSources(sort?: SalesListSortInput<TSort>): Promise<SalesLineStatusSource[]>;
  listLinesByIds(ids: string[]): Promise<SalesListLine[]>;
}

type LineStatusContext = {
  toFollowStatus: SaleStatusCodeRef;
  salesAtrCodes: Map<string, SaleStatusCodeRef>;
};

export function mapSalesListItem(line: SalesListLine, context: LineStatusContext) {
  const sale = line.sale;
  const lineAmount = line.saleAmount ?? line.amount;
  return {
    // Row identity is the detail line (one serial / TO-FOLLOW per row).
    id: line.id,
    detailId: line.id,
    saleId: sale.id,
    transactionNo: sale.transactionNo,
    transactionDate: sale.transactionDate ? sale.transactionDate.toISOString() : null,
    customerName: sale.customerName,
    packageName: line.packageType?.name ?? null,
    brandName: line.brand?.name ?? null,
    modelLabel: line.model ? line.model.skuCode || line.model.name : null,
    saleAmount: (lineAmount ?? 0).toString(),
    modelPrice: line.modelPrice != null ? line.modelPrice.toString() : null,
    atrStatus: sale.atrStatus,
    // Stock source drives edit-serial inventory picks; fall back to the sold place.
    branchId: sale.alternateBranchId ?? sale.branchId,
    branch: sale.branch,
    alternateBranch: sale.stockSourceBranch ?? sale.branch,
    serialNumberId: line.serialNumberId,
    serialNumber: line.serialNumber
      ? { id: line.serialNumber.id, serialNo: line.serialNumber.serialNo }
      : null,
    statusCode: resolveListedLineStatus(
      line,
      sale,
      context.toFollowStatus,
      context.salesAtrCodes,
    ),
    returnRequest: sale.returnRequest
      ? { id: sale.returnRequest.id, status: sale.returnRequest.status }
      : null,
    wasReplacedLine: wasLineForSameInvoiceReplacement({
      lineSerialNumberId: line.serialNumberId,
      transactionNo: sale.transactionNo,
      replacements: sale.replacements,
    }),
  };
}

export type SalesListItem = ReturnType<typeof mapSalesListItem>;

/**
 * One page of sale lines. A status card or search filters on the resolved STATUS, so
 * those load every line's status source first and page the matching ids.
 */
export async function listSalesLines<TSort extends string>(
  reader: SalesLineReader<TSort>,
  input: {
    tenantId: string;
    page?: number;
    limit?: number;
    sort: SalesListSortInput<TSort>;
    status?: string;
    q?: string;
  },
): Promise<PaginatedResult<SalesListItem>> {
  const status = parseSalesListStatusFilter(input.status);
  const query = input.q?.trim() || undefined;
  const [toFollowStatus, salesAtrCodes] = await Promise.all([
    resolveToFollowStatusCode(input.tenantId),
    loadSalesAtrCodesByCode(input.tenantId),
  ]);
  const context = { toFollowStatus, salesAtrCodes };

  if (!status && !query) {
    const result = await reader.listLines(
      { page: input.page, limit: input.limit },
      input.sort,
    );
    return {
      ...result,
      items: result.items.map((line) => mapSalesListItem(line, context)),
    };
  }

  const sources = await reader.listStatusSources(input.sort);
  const matchingIds = sources
    .filter((source) => {
      const resolved = resolveListedLineStatus(
        source,
        source.sale,
        toFollowStatus,
        salesAtrCodes,
      );
      if (query && !matchesSalesListSearch(query, source, resolved)) return false;
      if (!status) return true;
      return resolved != null && salesListStatusCodesMatch(resolved.code, status);
    })
    .map((source) => source.id);

  const { page, limit, skip } = resolvePagination({
    page: input.page,
    limit: input.limit,
  });
  const lines = await reader.listLinesByIds(matchingIds.slice(skip, skip + limit));
  return toPaginatedResult(
    lines.map((line) => mapSalesListItem(line, context)),
    matchingIds.length,
    page,
    limit,
  );
}
