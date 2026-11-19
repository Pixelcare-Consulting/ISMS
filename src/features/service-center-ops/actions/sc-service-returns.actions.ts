"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  loadProcessReturnLookups,
  processReturnPayloadSchema,
  type ProcessReturnLookups,
} from "@/features/sales/services/process-return-input";
import {
  SC_RETURNS_PROCESS,
  SC_SERVICE_RETURN_REQUEST_PERMISSIONS,
} from "@/features/service-center-ops/constants/sc-permissions";
import {
  scAtrOdrfDownloadUrl,
  type ScServiceReturnStatus,
} from "@/features/service-center-ops/constants/sc-service-returns";
import {
  parseScServiceReturnFilter,
  scServiceReturnsRepository,
  type ScServiceReturnDetailRow,
  type ScServiceReturnListRow,
} from "@/features/service-center-ops/repositories/sc-service-returns.repository";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import {
  scServiceReturnService,
  type ScServiceReturnActor,
} from "@/features/service-center-ops/services/sc-service-return.service";
import { SC_ORDER_PO_NUMBER_MAX } from "@/features/service-center-ordering/constants";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";

/**
 * Service center lane of a Service Return / Replacement (Process V-b). The CSR requests it
 * from SC Sales; the selling service center finishes it here.
 */

async function requireActor(): Promise<ScServiceReturnActor> {
  const session = await requirePermission(SC_RETURNS_PROCESS);
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    scopedServiceCenterIds: await resolveScIdsForUser(
      session.user.tenantId,
      session.user.id,
      session.user.permissions,
    ),
  };
}

function revalidateScServiceReturns() {
  revalidatePath("/service-centers/returns");
  revalidatePath("/service-centers/sales");
  revalidatePath("/service-centers/inventory");
  revalidatePath("/service-centers/orders");
}

/** CSR, SC Sales: request a Service Return / Replacement on an SC sale line. */
async function requireRequester() {
  const session = await requireAnyPermission([...SC_SERVICE_RETURN_REQUEST_PERMISSIONS]);
  const actor: ScServiceReturnActor = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    scopedServiceCenterIds: await resolveScIdsForUser(
      session.user.tenantId,
      session.user.id,
      session.user.permissions,
    ),
  };
  return { actor, requesterName: session.user.name?.trim() || session.user.email || "—" };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function modelLabel(model: { skuCode: string; name: string } | null | undefined): string | null {
  if (!model) return null;
  return model.skuCode ? `${model.skuCode} · ${model.name}` : model.name;
}

function personLabel(user: { name: string; email: string } | null | undefined): string | null {
  if (!user) return null;
  return user.name.trim() || user.email;
}

function asStatus(status: string): ScServiceReturnStatus {
  switch (status) {
    case "pending_sc":
    case "awaiting_stock":
    case "completed":
    case "rejected":
      return status;
    default:
      // Listing only returns these; anything else reads as finished.
      return "completed";
  }
}

function unitOf(row: Pick<ScServiceReturnListRow, "saleDetail">) {
  const line = row.saleDetail;
  return {
    serialNo: line?.serialNumber?.serialNo ?? null,
    modelLabel: modelLabel(line?.model),
  };
}

function toListDto(row: ScServiceReturnListRow) {
  const unit = unitOf(row);
  return {
    id: row.id,
    status: asStatus(row.status),
    actionType: row.actionType === "replacement" ? ("replacement" as const) : ("return" as const),
    stockStatusCode: row.stockStatusCode === "DEF" ? ("DEF" as const) : ("STK" as const),
    documentTypeName: row.documentType?.name ?? null,
    problemDescriptionText: row.problemDescriptionText,
    transactionNo: row.sale.transactionNo,
    transactionDate: row.sale.transactionDate?.toISOString() ?? null,
    customerName: row.sale.customerName,
    serviceCenterName: row.sale.serviceCenter.sapCode
      ? `${row.sale.serviceCenter.sapCode} · ${row.sale.serviceCenter.name}`
      : row.sale.serviceCenter.name,
    serialNo: unit.serialNo,
    modelLabel: unit.modelLabel,
    replacementSerialNo: row.replacementSerialNumber?.serialNo ?? null,
    replacementModelLabel: modelLabel(row.replacementSerialNumber?.model),
    specialOrderNumber: row.specialOrder?.orderNumber ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ScServiceReturnListItem = ReturnType<typeof toListDto>;

function toDetailDto(row: ScServiceReturnDetailRow) {
  const line = row.saleDetail;
  return {
    ...toListDto(row),
    contactNo: row.sale.contactNo,
    modelId: line?.model?.id ?? null,
    classification: row.classification,
    natureOfTransaction: row.natureOfTransaction,
    refContactPo: row.refContactPo,
    customerDealerBranch: row.customerDealerBranch,
    serviceModelLabel: modelLabel(row.serviceModel),
    requestedByName: personLabel(row.requestedBy),
    inspectedByName: personLabel(row.inspectedBy),
    inspectedAt: row.inspectedAt?.toISOString() ?? null,
    rejectReason: row.status === "rejected" ? row.evaluationNotes : null,
    receivedAt: row.serviceCenterLocation
      ? `${row.serviceCenterLocation.code} · ${row.serviceCenterLocation.name}`
      : null,
    heldSerialNo: row.heldSerialNumber?.serialNo ?? null,
    specialOrder: row.specialOrder
      ? {
          orderNumber: row.specialOrder.orderNumber,
          status: row.specialOrder.status,
          sapDocNum: row.specialOrder.sapDocNum,
        }
      : null,
    atrOdrfUrl: row.atrOdrfPdfPath ? scAtrOdrfDownloadUrl(row.id) : null,
    locations: row.sale.serviceCenter.locations.map((location) => ({
      id: location.id,
      name: `${location.code} · ${location.name}`,
    })),
  };
}

export type ScServiceReturnDetail = ReturnType<typeof toDetailDto>;

/** Process Return form lookups for SC sales: service document types only, no SC picker. */
export async function listScProcessReturnLookupsAction(): Promise<ProcessReturnLookups> {
  const { actor } = await requireRequester();
  return loadProcessReturnLookups(actor.tenantId, { serviceOnly: true });
}

export async function requestScServiceReturnAction(saleId: string, payload: unknown) {
  const { actor, requesterName } = await requireRequester();
  if (!saleId) return { error: "Sale not found" };
  const parsed = processReturnPayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: "Invalid process return details" };
  try {
    await scServiceReturnService.request(actor, { saleId, payload: parsed.data, requesterName });
  } catch (e) {
    return { error: errorMessage(e, "Could not request the return") };
  }
  revalidateScServiceReturns();
  return { success: true as const };
}

export async function listScServiceReturnsAction(input?: {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
}) {
  const actor = await requireActor();
  const filter = parseScServiceReturnFilter(input?.status);
  const [result, open] = await Promise.all([
    scServiceReturnsRepository.list(actor.tenantId, actor.scopedServiceCenterIds, {
      page: Number(input?.page) || 1,
      limit: parseTablePageSize(input?.limit),
      q: input?.q?.slice(0, 100) ?? "",
      filter,
    }),
    scServiceReturnsRepository.countOpenByStatus(actor.tenantId, actor.scopedServiceCenterIds),
  ]);
  return { ...result, filter, open, items: result.items.map(toListDto) };
}

export async function getScServiceReturnAction(returnRequestId: string) {
  const actor = await requireActor();
  if (!returnRequestId) return { error: "Service return not found" as const };
  const row = await scServiceReturnsRepository.findDetail(
    actor.tenantId,
    actor.scopedServiceCenterIds,
    returnRequestId,
  );
  if (!row) return { error: "Service return not found" as const };
  return { success: true as const, data: toDetailDto(row) };
}

const stockSchema = z.object({
  returnRequestId: z.string().min(1),
  modelId: z.string().min(1).optional().nullable(),
});

export async function listScServiceReplacementStockAction(input: unknown) {
  const actor = await requireActor();
  const parsed = stockSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" as const };
  try {
    return {
      success: true as const,
      data: await scServiceReturnService.listReplacementStock(actor, parsed.data),
    };
  } catch (e) {
    return { error: errorMessage(e, "Could not load service center stock") };
  }
}

const submitReturnSchema = z.object({
  returnRequestId: z.string().min(1),
  serviceCenterLocationId: z.string().min(1, "Choose the location that receives the unit"),
});

export async function submitScServiceReturnAction(input: unknown) {
  const actor = await requireActor();
  const parsed = submitReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await scServiceReturnService.submitReturn(actor, parsed.data);
  } catch (e) {
    return { error: errorMessage(e, "Could not submit the return") };
  }
  revalidateScServiceReturns();
  return { success: true as const };
}

const replacementSchema = z.object({
  returnRequestId: z.string().min(1),
  serviceCenterLocationId: z.string().min(1, "Choose the location that receives the returned unit"),
  modelId: z.string().min(1, "Choose the replacement model"),
  replacementSerialNumberId: z.string().min(1, "Choose the replacement serial"),
});

export async function completeScServiceReplacementAction(input: unknown) {
  const actor = await requireActor();
  const parsed = replacementSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await scServiceReturnService.completeReplacement(actor, parsed.data);
  } catch (e) {
    return { error: errorMessage(e, "Could not complete the replacement") };
  }
  revalidateScServiceReturns();
  return { success: true as const };
}

const specialOrderSchema = z.object({
  returnRequestId: z.string().min(1),
  modelId: z.string().min(1, "Choose the model to order"),
  serviceCenterLocationId: z.string().min(1).optional().nullable(),
  poNumber: z.string().trim().max(SC_ORDER_PO_NUMBER_MAX).optional().nullable(),
});

export async function raiseScServiceSpecialOrderAction(input: unknown) {
  const actor = await requireActor();
  const parsed = specialOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const order = await scServiceReturnService.raiseSpecialOrder(actor, parsed.data);
    revalidateScServiceReturns();
    return { success: true as const, orderNumber: order.orderNumber };
  } catch (e) {
    return { error: errorMessage(e, "Could not raise the special order") };
  }
}

const rejectSchema = z.object({
  returnRequestId: z.string().min(1),
  reason: z.string().trim().min(1, "Enter the reason for rejecting").max(500),
});

export async function rejectScServiceReturnAction(input: unknown) {
  const actor = await requireActor();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await scServiceReturnService.reject(actor, parsed.data);
  } catch (e) {
    return { error: errorMessage(e, "Could not reject the request") };
  }
  revalidateScServiceReturns();
  return { success: true as const };
}
