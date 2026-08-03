import type { LookupRecordStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  serialStatusSchema,
  serialWriteSchema,
} from "@/features/serial-numbers/schemas/serial-number.schema";
import {
  serialNumberRepository,
  type SerialTraceabilityRow,
} from "@/features/serial-numbers/repositories/serial-number.repository";
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
  | "count";

export interface SerialTimelineEvent {
  id: string;
  type: SerialEventType;
  label: string;
  at: Date;
  branch: string | null;
  status: { code: string; name: string } | null;
  detail: string | null;
}

export interface SerialTraceability {
  id: string;
  serialNo: string;
  recordStatus: LookupRecordStatus;
  model: { skuCode: string; name: string; brand: string | null };
  current: {
    branch: string | null;
    status: { code: string; name: string } | null;
  } | null;
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

function buildTimeline(row: SerialTraceabilityRow): SerialTimelineEvent[] {
  const events: SerialTimelineEvent[] = [];

  for (const inv of row.branchInventories) {
    events.push({
      id: `inv-${inv.id}`,
      type: "inventory",
      label: "In stock",
      at: inv.updatedAt,
      branch: inv.branch?.name ?? null,
      status: inv.statusCode
        ? { code: inv.statusCode.code, name: inv.statusCode.name }
        : null,
      detail: null,
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
      at: sale.createdAt,
      branch: sale.branch?.name ?? null,
      status: null,
      detail: [
        sale.transactionNo,
        amount != null ? `₱${amount.toLocaleString()}` : null,
        `ATR: ${sale.atrStatus}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });

    if (sale.returnRequest) {
      events.push({
        id: `return-${sale.returnRequest.id}`,
        type: "return",
        label: "Return requested",
        at: sale.returnRequest.createdAt,
        branch: sale.branch?.name ?? null,
        status: null,
        detail: `Return · ${sale.returnRequest.status}`,
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
      status: transfer.statusCode
        ? { code: transfer.statusCode.code, name: transfer.statusCode.name }
        : null,
      detail: [
        `${transfer.fromBranch?.name ?? "—"} → ${transfer.toBranch?.name ?? "—"}`,
        transfer.transferNo,
      ]
        .filter(Boolean)
        .join(" · "),
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
      status: pullout.statusCode
        ? { code: pullout.statusCode.code, name: pullout.statusCode.name }
        : null,
      detail: [
        `${pullout.branch?.name ?? "—"} → ${pullout.warehouse?.name ?? "—"}`,
        pullout.pulloutNo,
      ]
        .filter(Boolean)
        .join(" · "),
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
    });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export interface SerialNumberStatusKpi {
  code: string;
  name: string;
  count: number;
}

export interface SerialNumberKpis {
  totalSerials: number;
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
  list(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    filters?: { q?: string; status?: LookupRecordStatus },
  ) {
    return serialNumberRepository.list(tenantId, pagination, filters);
  },

  listModelOptions(tenantId: string) {
    return serialNumberRepository.listModelOptions(tenantId);
  },

  async getKpis(tenantId: string): Promise<SerialNumberKpis> {
    const [statusGroups, totalSerials] = await Promise.all([
      serialNumberRepository.countByRecordStatus(tenantId),
      serialNumberRepository.countAll(tenantId),
    ]);

    const countByStatus = new Map(
      statusGroups.map((g) => [g.recordStatus, g._count.id]),
    );

    return {
      totalSerials,
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

    const current = row.branchInventories[0] ?? null;

    return {
      id: row.id,
      serialNo: row.serialNo,
      recordStatus: row.recordStatus,
      model: {
        skuCode: row.model.skuCode,
        name: row.model.name,
        brand: row.model.brand?.name ?? null,
      },
      current: current
        ? {
            branch: current.branch?.name ?? null,
            status: current.statusCode
              ? { code: current.statusCode.code, name: current.statusCode.name }
              : null,
          }
        : null,
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
