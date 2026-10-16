import { tool } from "ai";
import { z } from "zod";

import { canAccessLogistics } from "@/features/logistics/constants/logistics-permissions";
import { MONTHLY_SIR_STATUS_LABELS } from "@/features/monthly-sir/constants/monthly-sir";
import { monthlySirService } from "@/features/monthly-sir/services/monthly-sir.service";
import { opsService } from "@/features/ops/services/ops.service";
import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import {
  WORKFLOW_MODULES,
  buildExplainPayload,
} from "@/features/pixelcare-ai/lib/explain-workflow";
import {
  assertPermittedBranch,
  isUnrestrictedBranchAccess,
} from "@/features/pixelcare-ai/tools/branch-access";
import {
  SAMPLE_DELIVERY_STATUS,
  SAMPLE_MONTHLY_SIR_STATUS,
  SAMPLE_OPS_INBOX,
  SAMPLE_PCOUNT_STATUS,
  SAMPLE_SAP_INTEGRATION_OVERVIEW,
} from "@/features/pixelcare-ai/tools/sample-fixtures";
import {
  retrievedAt,
  truncatePayload,
} from "@/features/pixelcare-ai/tools/tool-payload";
import { SAP_MANAGE } from "@/features/sap/constants/sap-permissions";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { STOCK_COUNT_SESSION_LABELS } from "@/features/stock-audit/constants/stock-count-workflow";
import { pcountDashboardService } from "@/features/stock-audit/services/pcount-dashboard.service";
import { stockAuditService } from "@/features/stock-audit/services/stock-audit.service";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";

const NEEDS_ACCEPTANCE_DELIVERY = new Set(["pending"]);
const NEEDS_ACCEPTANCE_TRANSFER = new Set(["pending_tl", "pending"]);
const NEEDS_ACCEPTANCE_PULLOUT = new Set(["pending_tl", "pending"]);

/**
 * Wave 2 read-only workflow explain + ops status tools for Pixelcare AI.
 */
export function buildWorkflowOpsTools(
  session: AppSession,
  options?: { defaultBranchId?: string | null },
) {
  const sampleMode = isPixelcareAiSampleMode();
  const permissions = session.user.permissions;
  const tenantId = session.user.tenantId;
  const userId = session.user.id;
  const defaultBranchId = options?.defaultBranchId?.trim() || null;
  const unrestricted = isUnrestrictedBranchAccess(permissions);

  const canInventory = hasPermission(permissions, "inventory.view");
  const canReturns =
    hasPermission(permissions, "returns.view") ||
    hasPermission(permissions, "returns.branch.view") ||
    hasPermission(permissions, "returns.service.view") ||
    hasPermission(permissions, "sales.return.view");
  const canLogistics = canAccessLogistics(permissions);
  const canSap = hasPermission(permissions, SAP_MANAGE);

  function resolveBranchArg(branchId?: string | null): string | null {
    const explicit = branchId?.trim();
    if (explicit) return explicit;
    return defaultBranchId;
  }

  return {
    explainIsmsWorkflow: tool({
      description:
        "Explain how a major ISMS module works (steps, screens, what users do). Use for P-Count, Monthly SIR, SAP, deliveries, ops, sales, orders, returns, planning, planogram, etc. Never invent process steps.",
      inputSchema: z.object({
        module: z
          .enum(WORKFLOW_MODULES)
          .describe("ISMS module to explain (allowlisted)"),
        query: z
          .string()
          .max(200)
          .optional()
          .describe("Optional focus within the module"),
      }),
      execute: async ({ module, query }) => {
        return truncatePayload(
          buildExplainPayload({
            module,
            query,
            sampleMode,
            permissions,
            retrievedAt: retrievedAt(),
          }),
        );
      },
    }),

    explainReturns: tool({
      description:
        "Explain how Returns / Replacement works (ATR flow and screens). Does not invent ATR steps.",
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .max(200)
          .default("returns replacement ATR")
          .describe("What the user wants explained about returns"),
      }),
      execute: async ({ query }) => {
        if (!canReturns && !sampleMode) {
          return {
            error:
              "You do not have Returns access. Ask an admin for returns permissions, or open Returns.",
            sourceHref: "/returns",
          };
        }
        return truncatePayload(
          buildExplainPayload({
            module: "returns",
            query,
            sampleMode,
            permissions,
            retrievedAt: retrievedAt(),
          }),
        );
      },
    }),

    getPcountStatus: tool({
      description:
        "Read open/recent P-Count (stock count) sessions for Active branch or a named branch, plus period KPIs when available. Read-only.",
      inputSchema: z.object({
        branchId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Branch id or SAP code. Prefer Active branchId from context when set.",
          ),
      }),
      execute: async ({ branchId }) => {
        if (!canInventory && !sampleMode) {
          return {
            error: "You do not have inventory view permission.",
            sourceHref: "/inventory/stock-count",
          };
        }

        const ref = resolveBranchArg(branchId);

        if (sampleMode) {
          return truncatePayload({
            ...SAMPLE_PCOUNT_STATUS,
            ...(ref
              ? {
                  branch: {
                    ...SAMPLE_PCOUNT_STATUS.branch,
                    // keep sample label; live overlay happens via assert in non-sample
                  },
                }
              : {}),
          });
        }

        let branchPayload: { id: string; name: string; sapCode: string } | null =
          null;
        if (ref) {
          const access = await assertPermittedBranch(session, ref);
          if (!access.ok) return { error: access.error };
          branchPayload = {
            id: access.branch.id,
            name: access.branch.name,
            sapCode: access.branch.sapCode,
          };
        }

        if (branchPayload) {
          const detail = await pcountDashboardService.getBranchDetail(
            tenantId,
            userId,
            unrestricted,
            branchPayload.id,
          );
          const sessions = (detail?.sessions ?? [])
            .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
            .map((s) => ({
              id: s.id,
              sessionNo: s.sessionNo,
              status: s.status,
              statusLabel: STOCK_COUNT_SESSION_LABELS[s.status] ?? s.status,
              counting: s.counting,
              posting: s.posting,
              createdAt:
                s.createdAt instanceof Date
                  ? s.createdAt.toISOString()
                  : String(s.createdAt),
              closedAt: s.closedAt
                ? s.closedAt instanceof Date
                  ? s.closedAt.toISOString()
                  : String(s.closedAt)
                : null,
            }));

          return truncatePayload({
            sample: false,
            retrievedAt: retrievedAt(),
            sourceHref: `/inventory/stock-count?branch=${branchPayload.id}`,
            branch: branchPayload,
            currentCounting: detail?.currentCounting ?? "Not started",
            currentPosting: detail?.currentPosting ?? "—",
            latestSessionId: detail?.latestSessionId ?? null,
            canPostDifferences: detail?.canPostDifferences ?? false,
            sessions,
            nextSteps: [
              {
                label: "Open P-Count",
                href: `/inventory/stock-count?branch=${branchPayload.id}`,
              },
              { label: "Open P-Count Dashboard", href: "/dashboard/pcount" },
            ],
          });
        }

        const [overview, listed] = await Promise.all([
          pcountDashboardService.getOverview(tenantId, userId, unrestricted),
          stockAuditService.listForUser(
            tenantId,
            userId,
            unrestricted,
            { page: 1, limit: PIXELCARE_AI_LIMITS.maxToolResultItems },
          ),
        ]);

        const sessions = listed.items.map((s) => ({
          id: s.id,
          sessionNo: s.sessionNo,
          status: s.status,
          statusLabel: STOCK_COUNT_SESSION_LABELS[s.status] ?? s.status,
          branchId: s.branch.id,
          branchName: s.branch.name,
          sapCode: s.branch.sapCode,
          createdAt:
            s.createdAt instanceof Date
              ? s.createdAt.toISOString()
              : String(s.createdAt),
          closedAt: s.closedAt
            ? s.closedAt instanceof Date
              ? s.closedAt.toISOString()
              : String(s.closedAt)
            : null,
        }));

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/inventory/stock-count",
          period: {
            year: overview.period.year,
            month: overview.period.month,
            label: overview.period.label,
          },
          kpis: overview.kpis,
          totalSessions: listed.total,
          sessions,
          note:
            listed.total > sessions.length
              ? `Showing first ${sessions.length} of ${listed.total} sessions. Pass branchId to focus one store.`
              : undefined,
          nextSteps: [
            { label: "Open P-Count", href: "/inventory/stock-count" },
            { label: "Open P-Count Dashboard", href: "/dashboard/pcount" },
          ],
        });
      },
    }),

    listMonthlySirStatus: tool({
      description:
        "List recent Monthly SIR requests (status labels) in the user's AOR. Optionally include upload allowance for Active/named branch.",
      inputSchema: z.object({
        branchId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional branch id or SAP code filter"),
        status: z
          .enum(["pending", "approved", "rejected"])
          .optional()
          .describe("Optional request status filter"),
      }),
      execute: async ({ branchId, status }) => {
        if (!canInventory && !sampleMode) {
          return {
            error: "You do not have inventory view permission.",
            sourceHref: "/inventory/monthly-sir",
          };
        }

        if (sampleMode) {
          return truncatePayload(SAMPLE_MONTHLY_SIR_STATUS);
        }

        const ref = resolveBranchArg(branchId);
        let resolvedBranchId: string | undefined;
        let branchPayload:
          | { id: string; name: string; sapCode: string }
          | undefined;

        if (ref) {
          const access = await assertPermittedBranch(session, ref);
          if (!access.ok) return { error: access.error };
          resolvedBranchId = access.branch.id;
          branchPayload = {
            id: access.branch.id,
            name: access.branch.name,
            sapCode: access.branch.sapCode,
          };
        }

        const result = await monthlySirService.list(
          tenantId,
          userId,
          unrestricted,
          {
            branchId: resolvedBranchId,
            status,
            page: 1,
            limit: PIXELCARE_AI_LIMITS.maxToolResultItems,
          },
        );

        let allowance: {
          canDirectUpload: boolean;
          role: string | null;
          message: string | null;
          slotsRemainingMonth: number | null;
          slotsRemainingToday: number | null;
        } | null = null;

        if (resolvedBranchId) {
          try {
            const a = await monthlySirService.getUploadAllowance({
              tenantId,
              userId,
              branchId: resolvedBranchId,
              permissions,
              roleSlugs: session.user.roleSlugs,
              unrestricted,
            });
            allowance = {
              canDirectUpload: a.canDirectUpload,
              role: a.role,
              message: a.message ?? null,
              slotsRemainingMonth: a.slotsRemainingMonth,
              slotsRemainingToday: a.slotsRemainingToday,
            };
          } catch {
            allowance = null;
          }
        }

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: resolvedBranchId
            ? `/inventory/monthly-sir?branch=${resolvedBranchId}`
            : "/inventory/monthly-sir",
          branch: branchPayload ?? null,
          total: result.total,
          requests: result.items.map((row) => ({
            id: row.id,
            status: row.status,
            statusLabel: MONTHLY_SIR_STATUS_LABELS[row.status] ?? row.status,
            purpose: row.purpose,
            branchId: row.branch.id,
            branchName: row.branch.name,
            sapCode: row.branch.sapCode,
            sessionNo: row.stockCountSession?.sessionNo ?? null,
            createdAt:
              row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : String(row.createdAt),
          })),
          allowance,
          nextSteps: [
            {
              label: "Open Monthly SIR",
              href: resolvedBranchId
                ? `/inventory/monthly-sir?branch=${resolvedBranchId}`
                : "/inventory/monthly-sir",
            },
          ],
        });
      },
    }),

    listOpsInbox: tool({
      description:
        "List deliveries / transfers / pull-outs that need acceptance or approval in the user's AOR (Operations inbox style).",
      inputSchema: z.object({
        reason: z.string().max(120).optional(),
      }),
      execute: async () => {
        if (!canInventory && !sampleMode) {
          return {
            error: "You do not have inventory view permission.",
            sourceHref: "/operations",
          };
        }

        if (sampleMode) {
          return truncatePayload(SAMPLE_OPS_INBOX);
        }

        const branchIds = unrestricted
          ? undefined
          : ((await getUserBranchIds(tenantId, userId)) ?? []);
        if (Array.isArray(branchIds) && branchIds.length === 0) {
          return {
            retrievedAt: retrievedAt(),
            sourceHref: "/operations",
            deliveries: [],
            transfers: [],
            pullouts: [],
            note: "No branches in your area of responsibility.",
          };
        }

        const [deliveries, transfers, pullouts] = await Promise.all([
          opsService.listDeliveries(tenantId, branchIds),
          opsService.listTransfers(tenantId),
          opsService.listPullouts(tenantId, branchIds),
        ]);

        const inboxDeliveries = deliveries
          .filter((d) => NEEDS_ACCEPTANCE_DELIVERY.has(d.statusCode.code))
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
          .map((d) => ({
            id: d.id,
            deliveryNo: d.deliveryNo,
            statusCode: d.statusCode.code,
            statusName: d.statusCode.name,
            branchName: d.branch.name,
            sapCode: d.branch.sapCode,
            href: "/operations",
          }));

        const inboxTransfers = transfers
          .filter((t) => NEEDS_ACCEPTANCE_TRANSFER.has(t.statusCode.code))
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
          .map((t) => ({
            id: t.id,
            transferNo: t.transferNo,
            statusCode: t.statusCode.code,
            statusName: t.statusCode.name,
            fromBranch: t.fromBranch.name,
            toBranch: t.toBranch.name,
            href: "/operations",
          }));

        const inboxPullouts = pullouts
          .filter((p) => NEEDS_ACCEPTANCE_PULLOUT.has(p.statusCode.code))
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
          .map((p) => ({
            id: p.id,
            pulloutNo: p.pulloutNo,
            statusCode: p.statusCode.code,
            statusName: p.statusCode.name,
            branchName: p.branch.name,
            href: "/operations",
          }));

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/operations",
          deliveries: inboxDeliveries,
          transfers: inboxTransfers,
          pullouts: inboxPullouts,
          note:
            inboxDeliveries.length === 0 &&
            inboxTransfers.length === 0 &&
            inboxPullouts.length === 0
              ? "Nothing waiting for acceptance in your scope."
              : undefined,
          nextSteps: [{ label: "Open Operations", href: "/operations" }],
        });
      },
    }),

    findDeliveryStatus: tool({
      description:
        "Look up a delivery by delivery number or id within the user's AOR. More specific than getLogisticsKpis aggregates.",
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .max(80)
          .describe("Delivery number or id fragment"),
      }),
      execute: async ({ query }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_DELIVERY_STATUS);
        }
        if (!canInventory && !canLogistics) {
          return {
            error:
              "Deliveries are outside your access (needs inventory.view or logistics access).",
            sourceHref: "/operations",
          };
        }

        const needle = query.trim();
        const branchIds = unrestricted
          ? null
          : await getUserBranchIds(tenantId, userId);

        const deliveries = await prisma.branchDelivery.findMany({
          where: {
            tenantId,
            ...(branchIds && branchIds.length > 0
              ? { branchId: { in: branchIds } }
              : {}),
            ...(branchIds && branchIds.length === 0
              ? { branchId: { in: [] as string[] } }
              : {}),
            OR: [
              { id: { contains: needle, mode: "insensitive" } },
              { deliveryNo: { contains: needle, mode: "insensitive" } },
            ],
          },
          take: 10,
          orderBy: { updatedAt: "desc" },
          include: {
            branch: { select: { id: true, name: true, sapCode: true } },
            statusCode: { select: { code: true, name: true } },
          },
        });

        if (deliveries.length === 0) {
          return {
            retrievedAt: retrievedAt(),
            deliveries: [],
            note: "No matching deliveries in your access scope.",
            sourceHref: "/operations",
          };
        }

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/operations",
          deliveries: deliveries.map((d) => ({
            id: d.id,
            deliveryNo: d.deliveryNo,
            statusCode: d.statusCode.code,
            statusName: d.statusCode.name,
            branchId: d.branch.id,
            branchName: d.branch.name,
            sapCode: d.branch.sapCode,
            href: "/operations",
            updatedAt: d.updatedAt.toISOString(),
          })),
          nextSteps: [
            { label: "Open Operations", href: "/operations" },
            { label: "Open Logistics deliveries", href: "/logistics/deliveries" },
          ],
        });
      },
    }),

    getSapIntegrationOverview: tool({
      description:
        "Permission-gated SAP connection overview (state only). Never returns credentials or triggers sync. Others should use explainIsmsWorkflow with module sap.",
      inputSchema: z.object({
        reason: z.string().max(120).optional(),
      }),
      execute: async () => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_SAP_INTEGRATION_OVERVIEW);
        }
        if (!canSap) {
          return {
            error:
              "SAP connection overview needs sap.manage. Call explainIsmsWorkflow with module \"sap\" for the workflow, open Settings → SAP integration, or ask an admin.",
            sourceHref: "/settings/sap-integration",
            nextSteps: [
              {
                label: "Open SAP integration settings",
                href: "/settings/sap-integration",
              },
            ],
          };
        }

        let state: "no_config" | "idle" | "connected" = "no_config";
        let expiresAt: number | null = null;
        try {
          const status = await sapServiceLayerService.getSessionStatus(tenantId);
          state = status.state;
          if (status.state === "connected") {
            expiresAt = status.expiresAt;
          }
        } catch {
          state = "no_config";
        }

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/settings/sap-integration",
          connection: {
            state,
            expiresAt,
          },
          whatSyncs: [
            "Branches — SAP Code and Branch Name via Sync from SAP (no Add branch in ISMS).",
            "Inventory / serials (STK) — warehouse and branch stock when Service Layer is connected.",
            "Orders and logistics handoff — documents may sync or queue when connected; failures need admin review.",
            "P-Count Post differences — Inventory Posting to SAP when connected; otherwise queued honestly.",
          ],
          limitation:
            "Never invents IDoc/API mappings, schedules, or credentials. Does not connect, disconnect, or process the SAP queue.",
          nextSteps: [
            {
              label: "Open SAP integration settings",
              href: "/settings/sap-integration",
            },
          ],
        });
      },
    }),
  };
}
