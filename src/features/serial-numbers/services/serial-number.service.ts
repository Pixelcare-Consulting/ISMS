import type { LookupRecordStatus, SkuStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import {
  serialStatusSchema,
  serialWriteSchema,
} from "@/features/serial-numbers/schemas/serial-number.schema";
import {
  serialNumberRepository,
  type SerialNumberListSort,
  type SerialNumberListSortDir,
  type SerialTraceabilityRow,
} from "@/features/serial-numbers/repositories/serial-number.repository";
import {
  applyWarehouseNames,
  loadWarehouseNames,
  warehouseCodesMissingNames,
} from "@/features/serial-numbers/services/serial-location-names";
import { prisma } from "@/lib/database/client";
import { decimalToNumberOrNull } from "@/lib/database/decimal";

interface SerialActorContext {
  tenantId: string;
  actorUserId: string;
}

export type SerialEventType =
  | "inventory"
  | "sale"
  | "return"
  | "transfer"
  | "pullout"
  | "count"
  | "delivery"
  | "backload";

export interface SerialStatusBadge {
  code: string;
  name: string;
  color?: string | null;
}

export interface SerialTimelineEvent {
  id: string;
  type: SerialEventType;
  label: string;
  at: Date;
  branch: string | null;
  status: SerialStatusBadge | null;
  detail: string | null;
  href: string | null;
}

export interface SerialRelatedLink {
  id: string;
  kind:
    | "product"
    | "branch"
    | "stock_units"
    | "warehouse"
    | "service_center"
    | "sale"
    | "return"
    | "transfer"
    | "pullout"
    | "delivery"
    | "order"
    | "stock_count"
    | "planogram"
    | "backload"
    | "serial_logs";
  label: string;
  detail: string | null;
  /** Null when the row is informational only (Product, Stock units). */
  href: string | null;
}

export interface SerialTraceability {
  id: string;
  serialNo: string;
  recordStatus: LookupRecordStatus;
  createdAt: Date;
  updatedAt: Date;
  model: {
    id: string;
    skuCode: string;
    name: string;
    brand: string | null;
    brandId: string | null;
    series: string | null;
    description: string | null;
    status: SkuStatus;
    srp: number | null;
    feature: string | null;
    resolution: string | null;
    size: string | null;
  };
  current: {
    branchId: string | null;
    branch: string | null;
    branchSapCode: string | null;
    region: string | null;
    province: string | null;
    dealer: string | null;
    warehouseId: string | null;
    warehouseCode: string | null;
    warehouseName: string | null;
    status: SerialStatusBadge | null;
    inventoryUpdatedAt: Date | null;
  } | null;
  sap: {
    absEntry: number | null;
    onHand: boolean;
    onHandSyncedAt: Date | null;
    syncedAt: Date | null;
    whsCode: string | null;
    whsName: string | null;
  };
  deliveryReceipt: {
    deliveryNo: string | null;
    deliveryDate: Date | null;
    agingDays: number | null;
  };
  planogram: {
    onPlanogram: boolean;
    branchId: string | null;
    maxQty: number | null;
  };
  warehouseLocations: Array<{
    id: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    locationCode: string;
    locationName: string;
    systemStatus: string | null;
    href: string;
  }>;
  serviceCenters: Array<{
    id: string;
    serviceCenterId: string;
    name: string;
    sapCode: string;
    location: string | null;
    status: SerialStatusBadge | null;
    href: string;
  }>;
  related: SerialRelatedLink[];
  /**
   * Same-SKU siblings and same-series models for the Product & record card.
   * `samples` is a short preview; `units` is the fuller list for the related modal.
   * Sibling serials link to their detail pages; series models are informational.
   */
  relatedUnits: {
    sameSku: {
      total: number;
      /** Units at this branch, or elsewhere when none share the branch. */
      scope: "branch" | "elsewhere";
      samples: Array<{
        id: string;
        serialNo: string;
        status: SerialStatusBadge | null;
        branchName: string | null;
        branchSapCode: string | null;
      }>;
      /** Full same-SKU sibling list for the related-products modal (capped server-side). */
      units: Array<{
        id: string;
        serialNo: string;
        status: SerialStatusBadge | null;
        branchName: string | null;
        branchSapCode: string | null;
      }>;
    };
    seriesModels: Array<{
      id: string;
      skuCode: string;
      name: string;
      qtyAtBranch: number;
    }>;
  };
  events: SerialTimelineEvent[];
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

function statusBadge(
  status: { code: string; name: string; color: string | null } | null | undefined,
): SerialStatusBadge | null {
  if (!status) return null;
  return { code: status.code, name: status.name, color: status.color };
}

/**
 * Stock units (`/inventory`) filters with `?branch=` as the branch **id**
 * (same as planogram links), not display name or SAP code.
 */
export function stockUnitsBranchHref(branchId: string): string {
  return `/inventory?branch=${encodeURIComponent(branchId)}`;
}

function buildTimeline(row: SerialTraceabilityRow): SerialTimelineEvent[] {
  const events: SerialTimelineEvent[] = [];

  for (const inv of row.branchInventories) {
    events.push({
      id: `inv-${inv.id}`,
      type: "inventory",
      label: "In stock",
      at: inv.updatedAt,
      branch: inv.branch?.name ?? null,
      status: statusBadge(inv.statusCode),
      detail: inv.branch?.sapCode ? `Branch ${inv.branch.sapCode}` : null,
      href: inv.branch ? stockUnitsBranchHref(inv.branch.id) : null,
    });
  }

  for (const detail of row.salesDetails) {
    const sale = detail.sale;
    const amount =
      decimalToNumberOrNull(detail.saleAmount) ??
      decimalToNumberOrNull(sale.amount);
    events.push({
      id: `sale-${detail.id}`,
      type: "sale",
      label: "Sold",
      at: sale.transactionDate ?? sale.createdAt,
      branch: sale.branch?.name ?? null,
      status: null,
      detail: [
        sale.transactionNo,
        amount != null ? `₱${amount.toLocaleString()}` : null,
        sale.customerName?.trim() || null,
        `ATR: ${sale.atrStatus}`,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/sales?q=${encodeURIComponent(sale.transactionNo)}`,
    });

    if (sale.returnRequest) {
      const action =
        sale.returnRequest.actionType === "replacement" ? "Replacement" : "Return";
      events.push({
        id: `return-${sale.returnRequest.id}`,
        type: "return",
        label: `${action} requested`,
        at: sale.returnRequest.createdAt,
        branch: sale.branch?.name ?? null,
        status: null,
        detail: `${action} · ${sale.returnRequest.status}`,
        href: "/returns",
      });
    }
  }

  for (const line of row.transferLines) {
    const transfer = line.transfer;
    events.push({
      id: `transfer-${line.id}`,
      type: "transfer",
      label: "Transferred",
      at: transfer.createdAt,
      branch: null,
      status: statusBadge(transfer.statusCode),
      detail: [
        `${transfer.fromBranch?.name ?? "—"} → ${transfer.toBranch?.name ?? "—"}`,
        transfer.transferNo,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/logistics/transfers?q=${encodeURIComponent(transfer.transferNo)}`,
    });
  }

  for (const line of row.pulloutLines) {
    const pullout = line.pullout;
    events.push({
      id: `pullout-${line.id}`,
      type: "pullout",
      label: "Pulled out",
      at: pullout.createdAt,
      branch: pullout.branch?.name ?? null,
      status: statusBadge(pullout.statusCode),
      detail: [
        `${pullout.branch?.name ?? "—"} → ${pullout.warehouse?.name ?? "—"}`,
        pullout.pulloutNo,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/logistics/pickups?q=${encodeURIComponent(pullout.pulloutNo)}`,
    });
  }

  for (const line of row.deliveryLines) {
    const delivery = line.delivery;
    const fromWh =
      line.warehouseLocationFrom?.warehouse?.name ??
      line.warehouseLocationFrom?.name ??
      null;
    events.push({
      id: `delivery-${line.id}`,
      type: "delivery",
      label: "Delivered",
      at: delivery.acceptedAt ?? delivery.createdAt,
      branch: delivery.branch?.name ?? null,
      status: statusBadge(delivery.statusCode),
      detail: [
        delivery.deliveryNo,
        fromWh ? `From ${fromWh}` : null,
        delivery.order?.orderNumber ? `Order ${delivery.order.orderNumber}` : null,
        delivery.sapDocRef ? `SAP ${delivery.sapDocRef}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/logistics/deliveries?q=${encodeURIComponent(delivery.deliveryNo)}`,
    });
  }

  for (const line of row.stockCountLines) {
    const session = line.session;
    events.push({
      id: `count-${line.id}`,
      type: "count",
      label: "Counted",
      at: line.countedAt ?? session.createdAt,
      branch: session.branch?.name ?? null,
      status: null,
      detail: `${session.sessionNo} · ${line.status}`,
      href: `/inventory/stock-count/${session.id}`,
    });
  }

  for (const backload of row.branchBackloads) {
    events.push({
      id: `backload-${backload.id}`,
      type: "backload",
      label: "Backloaded",
      at: backload.createdAt,
      branch: backload.branch?.name ?? null,
      status: null,
      detail: [
        backload.delivery?.deliveryNo ?? null,
        backload.remarks?.trim() || null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: backload.delivery
        ? `/logistics/deliveries?q=${encodeURIComponent(backload.delivery.deliveryNo)}`
        : null,
    });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function buildRelatedLinks(
  row: SerialTraceabilityRow,
  opts: {
    onPlanogram: boolean;
    planogramBranchId: string | null;
  },
): SerialRelatedLink[] {
  const related: SerialRelatedLink[] = [];

  related.push({
    id: `product-${row.model.id}`,
    kind: "product",
    label: row.model.skuCode,
    detail: row.model.name,
    href: null,
  });

  const currentBranch = row.branchInventories[0]?.branch ?? null;
  if (currentBranch) {
    related.push({
      id: `branch-${currentBranch.id}`,
      kind: "branch",
      label: currentBranch.name,
      detail: currentBranch.sapCode,
      href: `/settings/branches?q=${encodeURIComponent(currentBranch.sapCode)}`,
    });
    related.push({
      id: `stock-units-${currentBranch.id}`,
      kind: "stock_units",
      label: "Stock units",
      detail: currentBranch.name,
      href: null,
    });
  }

  if (opts.onPlanogram && opts.planogramBranchId) {
    related.push({
      id: `planogram-${opts.planogramBranchId}`,
      kind: "planogram",
      label: "Planogram",
      detail: currentBranch?.name ?? null,
      href: `/settings/planogram/${opts.planogramBranchId}`,
    });
  }

  for (const wh of row.warehouseInventories) {
    const warehouse = wh.warehouseLocation.warehouse;
    related.push({
      id: `warehouse-${wh.id}`,
      kind: "warehouse",
      label: warehouse.name,
      detail: `${warehouse.code} · ${wh.warehouseLocation.name}`,
      href: `/inventory/warehouse-stock?warehouse=${warehouse.id}&q=${encodeURIComponent(row.serialNo)}`,
    });
  }

  for (const sc of row.serviceCenterInventories) {
    related.push({
      id: `sc-${sc.id}`,
      kind: "service_center",
      label: sc.serviceCenter.name,
      detail: sc.serviceCenterLocation.name,
      href: `/service-centers/inventory?q=${encodeURIComponent(row.serialNo)}`,
    });
  }

  for (const detail of row.salesDetails) {
    const sale = detail.sale;
    related.push({
      id: `sale-${sale.id}`,
      kind: "sale",
      label: sale.transactionNo,
      detail: sale.branch?.name ?? null,
      href: `/sales?q=${encodeURIComponent(sale.transactionNo)}`,
    });
    if (sale.returnRequest) {
      related.push({
        id: `return-${sale.returnRequest.id}`,
        kind: "return",
        label:
          sale.returnRequest.actionType === "replacement"
            ? "Replacement"
            : "Return",
        detail: sale.returnRequest.status,
        href: "/returns",
      });
    }
  }

  for (const line of row.transferLines) {
    related.push({
      id: `transfer-${line.transfer.id}`,
      kind: "transfer",
      label: line.transfer.transferNo,
      detail: `${line.transfer.fromBranch?.name ?? "—"} → ${line.transfer.toBranch?.name ?? "—"}`,
      href: `/logistics/transfers?q=${encodeURIComponent(line.transfer.transferNo)}`,
    });
  }

  for (const line of row.pulloutLines) {
    related.push({
      id: `pullout-${line.pullout.id}`,
      kind: "pullout",
      label: line.pullout.pulloutNo,
      detail: `${line.pullout.branch?.name ?? "—"} → ${line.pullout.warehouse?.name ?? "—"}`,
      href: `/logistics/pickups?q=${encodeURIComponent(line.pullout.pulloutNo)}`,
    });
  }

  for (const line of row.deliveryLines) {
    related.push({
      id: `delivery-${line.delivery.id}`,
      kind: "delivery",
      label: line.delivery.deliveryNo,
      detail: line.delivery.branch?.name ?? null,
      href: `/logistics/deliveries?q=${encodeURIComponent(line.delivery.deliveryNo)}`,
    });
    if (line.delivery.order) {
      related.push({
        id: `order-${line.delivery.order.id}`,
        kind: "order",
        label: line.delivery.order.orderNumber,
        detail: "Linked order",
        href: `/orders?q=${encodeURIComponent(line.delivery.order.orderNumber)}`,
      });
    }
  }

  for (const line of row.stockCountLines) {
    related.push({
      id: `count-${line.session.id}`,
      kind: "stock_count",
      label: line.session.sessionNo,
      detail: line.session.branch?.name ?? null,
      href: `/inventory/stock-count/${line.session.id}`,
    });
  }

  for (const backload of row.branchBackloads) {
    related.push({
      id: `backload-${backload.id}`,
      kind: "backload",
      label: backload.delivery?.deliveryNo ?? "Backload",
      detail: backload.branch?.name ?? backload.remarks ?? null,
      href: backload.delivery
        ? `/logistics/deliveries?q=${encodeURIComponent(backload.delivery.deliveryNo)}`
        : "/logistics/deliveries",
    });
  }

  if (row.history.length > 0) {
    related.push({
      id: `serial-logs-${row.id}`,
      kind: "serial_logs",
      label: "Serial number logs",
      detail: `${row.history.length}+ movement entries`,
      href: `/audit-logs/serial-numbers?q=${encodeURIComponent(row.serialNo)}`,
    });
  }

  const seen = new Set<string>();
  return related.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export interface SerialNumberStatusKpi {
  code: string;
  name: string;
  count: number;
}

export interface SerialNumberKpis {
  totalModels: number;
  statuses: SerialNumberStatusKpi[];
}

const RECORD_STATUS_LABELS: Record<LookupRecordStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

const RECORD_STATUS_ORDER = Object.keys(
  RECORD_STATUS_LABELS,
) as LookupRecordStatus[];

export const serialNumberService = {
  async list(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    filters?: { q?: string; status?: LookupRecordStatus },
    sort?: { field?: SerialNumberListSort; dir?: SerialNumberListSortDir },
  ) {
    const page = await serialNumberRepository.list(tenantId, pagination, filters, sort);
    const modelIds = page.items.map((item) => item.id);
    const [modelStock, syncByModel] = await Promise.all([
      serialNumberRepository.modelStockFigures(tenantId, modelIds),
      serialNumberRepository.latestSapSyncByModel(tenantId, modelIds),
    ]);
    return {
      ...page,
      modelStock,
      items: page.items.map((item) => ({
        ...item,
        lastSyncedAt: syncByModel[item.id]?.lastSyncedAt ?? null,
        serialCount: syncByModel[item.id]?.serialCount ?? 0,
        sapOnHand: modelStock[item.id]?.sapOnHand ?? null,
      })),
    };
  },

  async listModelSerials(tenantId: string, modelId: string, page = 1, query?: string) {
    const listed = await serialNumberRepository.listModelSerials(tenantId, modelId, page, query);
    const missing = warehouseCodesMissingNames(listed.items);
    if (missing.length === 0) return listed;
    const names = await loadWarehouseNames(tenantId, missing);
    if (names.size === 0) return listed;
    return { ...listed, items: applyWarehouseNames(listed.items, names) };
  },

  listModelOptions(tenantId: string) {
    return serialNumberRepository.listModelOptions(tenantId);
  },

  async getKpis(tenantId: string): Promise<SerialNumberKpis> {
    const [totalModels, active, inactive] = await Promise.all([
      serialNumberRepository.countListedModels(tenantId),
      serialNumberRepository.countListedModels(tenantId, "active"),
      serialNumberRepository.countListedModels(tenantId, "inactive"),
    ]);

    const countByStatus = new Map<LookupRecordStatus, number>([
      ["active", active],
      ["inactive", inactive],
    ]);

    return {
      totalModels,
      statuses: RECORD_STATUS_ORDER.map((status) => ({
        code: status,
        name: RECORD_STATUS_LABELS[status],
        count: countByStatus.get(status) ?? 0,
      })),
    };
  },

  async getTraceability(
    tenantId: string,
    id: string,
  ): Promise<SerialTraceability | null> {
    const row = await serialNumberRepository.getTraceability(tenantId, id);
    if (!row) return null;

    const currentInv = row.branchInventories[0] ?? null;
    const branch = currentInv?.branch ?? null;

    const [deliveries, planogram, whsNames, relatedUnitsPreview] = await Promise.all([
      inventoryRepository.findLatestAcceptedDeliveries(tenantId, [row.id]),
      branch
        ? prisma.branchPlanogram.findFirst({
            where: {
              tenantId,
              branchId: branch.id,
              modelId: row.model.id,
            },
            select: { maxQty: true, branchId: true },
          })
        : Promise.resolve(null),
      row.sapWhsCode && !branch
        ? loadWarehouseNames(tenantId, [row.sapWhsCode])
        : Promise.resolve(new Map<string, string>()),
      serialNumberRepository.findRelatedUnitsPreview(tenantId, {
        excludeSerialId: row.id,
        modelId: row.model.id,
        seriesId: row.model.series?.id ?? null,
        branchId: branch?.id ?? null,
      }),
    ]);

    const delivery = deliveries[0] ?? null;
    const agingDays = (() => {
      const anchor = delivery?.deliveryDate ?? currentInv?.createdAt ?? row.createdAt;
      const days = Math.floor((Date.now() - anchor.getTime()) / (24 * 60 * 60 * 1000));
      return Math.max(0, days);
    })();

    const sapWhsName =
      branch?.primaryWarehouse?.code === row.sapWhsCode
        ? branch.primaryWarehouse.name
        : row.sapWhsCode
          ? (whsNames.get(row.sapWhsCode) ?? null)
          : null;

    return {
      id: row.id,
      serialNo: row.serialNo,
      recordStatus: row.recordStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      model: {
        id: row.model.id,
        skuCode: row.model.skuCode,
        name: row.model.name,
        brand: row.model.brand?.name ?? null,
        brandId: row.model.brand?.id ?? null,
        series: row.model.series?.name ?? null,
        description: row.model.description ?? null,
        status: row.model.status,
        srp: decimalToNumberOrNull(row.model.srp),
        feature: row.model.feature?.name ?? null,
        resolution: row.model.resolution?.name ?? null,
        size: row.model.actualSize?.name ?? null,
      },
      current: currentInv
        ? {
            branchId: branch?.id ?? null,
            branch: branch?.name ?? null,
            branchSapCode: branch?.sapCode ?? null,
            region: branch?.region?.name ?? null,
            province: branch?.province?.name ?? null,
            dealer: branch?.dealer?.name ?? null,
            warehouseId: branch?.primaryWarehouse?.id ?? null,
            warehouseCode: branch?.primaryWarehouse?.code ?? row.sapWhsCode ?? null,
            warehouseName: branch?.primaryWarehouse?.name ?? sapWhsName,
            status: statusBadge(currentInv.statusCode),
            inventoryUpdatedAt: currentInv.updatedAt,
          }
        : row.sapWhsCode
          ? {
              branchId: null,
              branch: null,
              branchSapCode: null,
              region: null,
              province: null,
              dealer: null,
              warehouseId: null,
              warehouseCode: row.sapWhsCode,
              warehouseName: sapWhsName,
              status: null,
              inventoryUpdatedAt: row.sapOnHandSyncedAt,
            }
          : null,
      sap: {
        absEntry: row.sapAbsEntry,
        onHand: row.sapOnHand,
        onHandSyncedAt: row.sapOnHandSyncedAt,
        syncedAt: row.sapSyncedAt,
        whsCode: row.sapWhsCode,
        whsName: sapWhsName ?? branch?.primaryWarehouse?.name ?? null,
      },
      deliveryReceipt: {
        deliveryNo: delivery?.deliveryNo ?? null,
        deliveryDate: delivery?.deliveryDate ?? null,
        agingDays,
      },
      planogram: {
        onPlanogram: Boolean(planogram),
        branchId: planogram?.branchId ?? null,
        maxQty: planogram?.maxQty ?? null,
      },
      warehouseLocations: row.warehouseInventories.map((wh) => ({
        id: wh.id,
        warehouseId: wh.warehouseLocation.warehouse.id,
        warehouseCode: wh.warehouseLocation.warehouse.code,
        warehouseName: wh.warehouseLocation.warehouse.name,
        locationCode: wh.warehouseLocation.code,
        locationName: wh.warehouseLocation.name,
        systemStatus: wh.systemStatus,
        href: `/inventory/warehouse-stock?warehouse=${wh.warehouseLocation.warehouse.id}&q=${encodeURIComponent(row.serialNo)}`,
      })),
      serviceCenters: row.serviceCenterInventories.map((sc) => ({
        id: sc.id,
        serviceCenterId: sc.serviceCenter.id,
        name: sc.serviceCenter.name,
        sapCode: sc.serviceCenter.sapCode,
        location: sc.serviceCenterLocation.name,
        status: statusBadge(sc.statusCode),
        href: `/service-centers/inventory?q=${encodeURIComponent(row.serialNo)}`,
      })),
      related: buildRelatedLinks(row, {
        onPlanogram: Boolean(planogram),
        planogramBranchId: planogram?.branchId ?? null,
      }),
      relatedUnits: {
        sameSku: {
          total: relatedUnitsPreview.sameSku.total,
          scope: relatedUnitsPreview.sameSku.scope,
          samples: relatedUnitsPreview.sameSku.samples.map((sample) => ({
            id: sample.id,
            serialNo: sample.serialNo,
            status: statusBadge(sample.statusCode),
            branchName: sample.branchName,
            branchSapCode: sample.branchSapCode,
          })),
          units: relatedUnitsPreview.sameSku.units.map((unit) => ({
            id: unit.id,
            serialNo: unit.serialNo,
            status: statusBadge(unit.statusCode),
            branchName: unit.branchName,
            branchSapCode: unit.branchSapCode,
          })),
        },
        seriesModels: relatedUnitsPreview.seriesModels,
      },
      events: buildTimeline(row),
    };
  },

  async create(ctx: SerialActorContext, input: unknown) {
    const parsed = serialWriteSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const model = await serialNumberRepository.findModelInTenant(
      ctx.tenantId,
      parsed.data.modelId,
    );
    if (!model) {
      throw new Error("Invalid model");
    }

    try {
      const row = await serialNumberRepository.create(ctx.tenantId, {
        ...parsed.data,
        createdById: ctx.actorUserId,
      });
      await auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        action: "serial_number.created",
        entityType: "SerialNumber",
        entityId: row.id,
        metadata: { serialNo: row.serialNo },
      });
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A serial number with this value already exists");
      }
      throw error;
    }
  },

  async update(ctx: SerialActorContext, id: string, input: unknown) {
    const parsed = serialWriteSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await serialNumberRepository.findById(ctx.tenantId, id);
    if (!existing) {
      throw new Error("Serial number not found");
    }

    const model = await serialNumberRepository.findModelInTenant(
      ctx.tenantId,
      parsed.data.modelId,
    );
    if (!model) {
      throw new Error("Invalid model");
    }

    try {
      const row = await serialNumberRepository.update(ctx.tenantId, id, parsed.data);
      await auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        action: "serial_number.updated",
        entityType: "SerialNumber",
        entityId: row.id,
        metadata: { serialNo: row.serialNo, previousSerialNo: existing.serialNo },
      });
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A serial number with this value already exists");
      }
      throw error;
    }
  },

  async setStatus(ctx: SerialActorContext, id: string, input: unknown) {
    const parsed = serialStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await serialNumberRepository.findById(ctx.tenantId, id);
    if (!existing) {
      throw new Error("Serial number not found");
    }

    const recordStatus: LookupRecordStatus = parsed.data.recordStatus;
    const row = await serialNumberRepository.setStatus(ctx.tenantId, id, recordStatus);
    await auditService.log({
      tenantId: ctx.tenantId,
      userId: ctx.actorUserId,
      action: "serial_number.status_changed",
      entityType: "SerialNumber",
      entityId: row.id,
      metadata: {
        serialNo: row.serialNo,
        from: existing.recordStatus,
        to: recordStatus,
      },
    });
    return row;
  },
};
