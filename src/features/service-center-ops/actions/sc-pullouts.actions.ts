"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { LogisticsKpis } from "@/features/logistics/actions/logistics.actions";
import { parseManilaDateTime, parseScheduleDate } from "@/features/logistics/lib/shipment";
import {
  optionalFormDate,
  pulloutLineSchema,
  pulloutListSchema,
} from "@/features/logistics/schemas/pullout.schema";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import {
  EMPTY_PULLOUT_CHECKLIST_OPTIONS,
  loadPulloutChecklistOptions,
  type PulloutChecklistOptions,
} from "@/features/logistics/services/pullout-checklist-options";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  SC_LOGISTICS_ACCESS,
  SC_LOGISTICS_CREATE,
  SC_LOGISTICS_MANAGE,
  SC_ORDERS_APPROVE,
} from "@/features/service-center-ops/constants/sc-permissions";
import {
  scOpsRepository,
  type ScPulloutListSort,
} from "@/features/service-center-ops/repositories/sc-ops.repository";
import { scPulloutPostingService } from "@/features/service-center-ops/services/sc-pullout-posting.service";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

/**
 * Service center pull-outs. Same actions as branch pull-outs (`logistics.actions`), gated by
 * SC logistics permissions and SC area of responsibility. No Check SAP: the flow ends at Send.
 */

const CREATE_PERMISSIONS = [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE] as const;
const TL_PERMISSIONS = [SC_ORDERS_APPROVE, SC_LOGISTICS_MANAGE] as const;
const SORT_FIELDS = new Set<ScPulloutListSort>(["pulloutNo", "serviceCenter", "reason", "status"]);

const scPulloutSchema = z.object({
  serviceCenterId: z.string().min(1),
  lines: z.array(pulloutLineSchema).min(1),
  notes: z.string().optional(),
});

type ActionResult = { success: true } | { error: string };

function actor(session: {
  user: { tenantId: string; id: string; permissions?: string[]; roleSlugs?: string[] };
}): PostingActor {
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    permissions: session.user.permissions,
    roleSlugs: session.user.roleSlugs,
  };
}

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

function revalidateScPullout(id?: string) {
  revalidatePath("/service-centers/pullouts");
  if (id) revalidatePath(`/service-centers/pullouts/${id}`);
  revalidatePath("/service-centers/inventory");
}

function parseSort(value?: string): ScPulloutListSort | undefined {
  return value && SORT_FIELDS.has(value as ScPulloutListSort) ? (value as ScPulloutListSort) : undefined;
}

async function scopeOf(session: Awaited<ReturnType<typeof requireAnyPermission>>) {
  return resolveScIdsForUser(session.user.tenantId, session.user.id, session.user.permissions);
}

export async function listScPulloutsAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACCESS]);
  return scOpsRepository.listPullouts(
    session.user.tenantId,
    await scopeOf(session),
    { page: input?.page, limit: parseTablePageSize(input?.limit) },
    {
      field: parseSort(input?.sort),
      dir: input?.sortDir === "asc" || input?.sortDir === "desc" ? input.sortDir : undefined,
    },
  );
}

export async function getScPulloutKpisAction(): Promise<LogisticsKpis> {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACCESS]);
  const tenantId = session.user.tenantId;
  const scope = await scopeOf(session);
  const [codes, groups, total] = await Promise.all([
    reasonStatusService.listActiveCodes(tenantId, "pullout_workflow"),
    scOpsRepository.countPulloutsByStatus(tenantId, scope),
    scOpsRepository.countAllPullouts(tenantId, scope),
  ]);
  const countByCodeId = new Map(groups.map((group) => [group.statusCodeId, group._count.id]));
  return {
    total,
    statuses: codes.map((code) => ({
      code: code.code,
      name: code.name,
      color: code.color,
      sortOrder: code.sortOrder,
      count: countByCodeId.get(code.id) ?? 0,
    })),
  };
}

export async function getScPulloutDetailAction(id: string) {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACCESS]);
  try {
    const detail = await scPulloutPostingService.getDetail(actor(session), id);
    return { success: true as const, detail };
  } catch (error) {
    return actionError(error, "Pull-out not found");
  }
}

/** Service centers for the create form: the person's area of responsibility. */
export async function listScCentersForPulloutsAction() {
  const session = await requireAnyPermission([...CREATE_PERMISSIONS]);
  const scope = await scopeOf(session);
  return prisma.serviceCenter.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      status: "active",
      ...(scope ? { id: { in: scope } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listScPulloutSerialsAction(serviceCenterId: string) {
  const session = await requireAnyPermission([...CREATE_PERMISSIONS]);
  try {
    const serials = await scPulloutPostingService.listSerials(actor(session), serviceCenterId);
    return { success: true as const, serials };
  } catch (error) {
    return actionError(error, "Failed to load serials");
  }
}

export async function listScPulloutChecklistOptionsAction(): Promise<
  PulloutChecklistOptions & { error?: string }
> {
  const session = await requireAnyPermission([...CREATE_PERMISSIONS]);
  try {
    return await loadPulloutChecklistOptions(session.user.tenantId);
  } catch (error) {
    return {
      ...EMPTY_PULLOUT_CHECKLIST_OPTIONS,
      ...actionError(error, "Failed to load pull-out checklist options"),
    };
  }
}

export async function createScPulloutAction(input: unknown) {
  const session = await requireAnyPermission([...CREATE_PERMISSIONS]);
  const parsed = scPulloutSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a service center and the details for each serial" };
  try {
    const row = await scPulloutPostingService.create(actor(session), parsed.data);
    revalidateScPullout(row.id);
    return { success: true as const, id: row.id, pulloutNo: row.pulloutNo };
  } catch (error) {
    return actionError(error, "Failed to create pull-out");
  }
}

export async function uploadScPulloutAttachmentAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAnyPermission([...CREATE_PERMISSIONS]);
  const pulloutId = formData.get("pulloutId");
  const file = formData.get("file");
  if (typeof pulloutId !== "string" || !pulloutId) return { error: "Missing pull-out reference" };
  if (!(file instanceof File)) return { error: "No file selected" };
  try {
    await scPulloutPostingService.addAttachment(actor(session), pulloutId, file);
    revalidateScPullout(pulloutId);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to attach the file");
  }
}

export async function approveScPulloutLineAction(id: string, serialNumberId: string): Promise<ActionResult> {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await scPulloutPostingService.approveLine(actor(session), id, serialNumberId);
    revalidateScPullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to approve this unit");
  }
}

export async function deleteScPulloutLineAction(id: string, serialNumberId: string): Promise<ActionResult> {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await scPulloutPostingService.deleteLine(actor(session), id, serialNumberId);
    revalidateScPullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to delete this unit");
  }
}

export async function approveScPulloutAction(id: string): Promise<ActionResult> {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await scPulloutPostingService.approve(actor(session), id);
    revalidateScPullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to approve pull-out");
  }
}

export async function rejectScPulloutAction(id: string): Promise<ActionResult> {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await scPulloutPostingService.reject(actor(session), id);
    revalidateScPullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to reject pull-out");
  }
}

export async function updateScPulloutListAction(id: string, input: unknown): Promise<ActionResult> {
  const session = await requirePermission(SC_LOGISTICS_MANAGE);
  const parsed = pulloutListSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose the serials on this list" };
  const scheduledAt = optionalFormDate(parsed.data.scheduledAt, parseManilaDateTime);
  const actualScheduledDate = optionalFormDate(parsed.data.actualPulloutDate, parseScheduleDate);
  if (scheduledAt === "invalid" || actualScheduledDate === "invalid") {
    return { error: "Enter a valid schedule and actual pull-out date" };
  }
  try {
    await scPulloutPostingService.updateList(actor(session), {
      pulloutId: id,
      waybillNo: parsed.data.waybillNo,
      courierName: parsed.data.courierName,
      scheduledAt,
      actualScheduledDate,
      notes: parsed.data.notes,
      serialNumberIds: parsed.data.serialNumberIds,
      addedLines: parsed.data.addedLines,
    });
    revalidateScPullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to save the pull-out list");
  }
}

export async function releaseScPulloutAction(id: string): Promise<ActionResult> {
  const session = await requirePermission(SC_LOGISTICS_MANAGE);
  try {
    await scPulloutPostingService.finalize(actor(session), id);
    revalidateScPullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to send the pull-out");
  }
}
