import { tool } from "ai";
import { z } from "zod";

import {
  formatHelpHitsForPrompt,
  searchHelpCorpus,
} from "@/features/ai/services/help-corpus.service";
import { RETURNS_MODULE_GUIDE } from "@/content/module-guides/returns";
import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import { computeSugQty } from "@/features/pixelcare-ai/lib/sug";
import {
  assertPermittedBranch,
  isUnrestrictedBranchAccess,
  listPermittedBranches as fetchPermittedBranches,
} from "@/features/pixelcare-ai/tools/branch-access";
import { buildPlanningOpsTools } from "@/features/pixelcare-ai/tools/planning-ops-tools";
import {
  SAMPLE_BRANCH_STOCK,
  SAMPLE_ORDER_STATUS,
  SAMPLE_PERMITTED_BRANCHES,
  SAMPLE_SHELF_GAPS,
} from "@/features/pixelcare-ai/tools/sample-fixtures";
import {
  retrievedAt,
  truncatePayload,
} from "@/features/pixelcare-ai/tools/tool-payload";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";
import type { InventoryGroupModelSummary } from "@/features/inventory/services/inventory.service";

export function buildPixelcareAiTools(
  session: AppSession,
  options?: { defaultBranchId?: string | null },
) {
  const sampleMode = isPixelcareAiSampleMode();
  const permissions = session.user.permissions;
  const defaultBranchId = options?.defaultBranchId?.trim() || null;
  const canInventory = hasPermission(permissions, "inventory.view");
  const canOrders = hasAnyOrderPermission(permissions, "view");
  const canPlanogram =
    hasPermission(permissions, "planogram.view") ||
    hasPermission(permissions, "planogram.manage") ||
    hasAnyOrderPermission(permissions, "view");
  const canReturns =
    hasPermission(permissions, "returns.view") ||
    hasPermission(permissions, "returns.branch.view") ||
    hasPermission(permissions, "returns.service.view") ||
    hasPermission(permissions, "sales.return.view");

  function resolveBranchArg(branchId?: string | null): string | null {
    const explicit = branchId?.trim();
    if (explicit) return explicit;
    return defaultBranchId;
  }

  return {
    ...buildPlanningOpsTools(session),

    listPermittedBranches: tool({
      description:
        "List branches the signed-in user may access (AOR-scoped). Use when they ask which branches / stores they have. Returns id, name, and sapCode only.",
      inputSchema: z.object({
        query: z
          .string()
          .max(80)
          .optional()
          .describe("Optional name or SAP code filter (case-insensitive contains)"),
      }),
      execute: async ({ query }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_PERMITTED_BRANCHES);
        }

        const all = await fetchPermittedBranches(session);
        const needle = query?.trim().toLowerCase();
        const filtered = needle
          ? all.filter(
              (b) =>
                b.name.toLowerCase().includes(needle) ||
                b.sapCode.toLowerCase().includes(needle),
            )
          : all;
        const capped = filtered.slice(0, PIXELCARE_AI_LIMITS.maxListBranches);

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          total: filtered.length,
          returned: capped.length,
          truncated: filtered.length > capped.length,
          branches: capped.map((b) => ({
            id: b.id,
            name: b.name,
            sapCode: b.sapCode,
          })),
          note:
            filtered.length === 0
              ? "No permitted branches in your area of responsibility."
              : filtered.length > capped.length
                ? `Showing first ${capped.length} of ${filtered.length}. Narrow with query if needed.`
                : undefined,
        });
      },
    }),

    checkBranchStock: tool({
      description:
        "Read permitted branch stock (STK-focused summary). Pass branch id or SAP code; omit when Context Active branch is set.",
      inputSchema: z.object({
        branchId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Branch id or SAP code from permitted branches. Prefer Active branchId from context when set.",
          ),
      }),
      execute: async ({ branchId }) => {
        if (!canInventory && !sampleMode) {
          return { error: "You do not have inventory view permission." };
        }
        const ref = resolveBranchArg(branchId);
        if (!ref) {
          return {
            error:
              "No branch selected. Set Context branch, pass a branch id/SAP code, or call listPermittedBranches.",
          };
        }
        const access = await assertPermittedBranch(session, ref);
        if (!access.ok) return { error: access.error };

        const resolvedBranchId = access.branch.id;
        const branchPayload = {
          id: access.branch.id,
          name: access.branch.name,
          sapCode: access.branch.sapCode,
        };

        if (sampleMode) {
          return truncatePayload({
            ...SAMPLE_BRANCH_STOCK,
            branch: branchPayload,
          });
        }

        const unrestricted = isUnrestrictedBranchAccess(permissions);
        const groups = await inventoryService.listGroupChildrenForUser(
          session.user.tenantId,
          session.user.id,
          unrestricted,
          {
            groupBy: "by-branch",
            level: "models",
            branchId: resolvedBranchId,
            pagination: { page: 1, limit: PIXELCARE_AI_LIMITS.maxToolResultItems },
          },
        );

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: `/inventory?branch=${resolvedBranchId}`,
          branch: branchPayload,
          totalModels: groups.total,
          items: groups.items
            .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
            .map((item) => {
              const modelItem = item as InventoryGroupModelSummary;
              return {
                skuCode: modelItem.model.sku,
                name: modelItem.model.name,
                stkQty: modelItem.counts.available + modelItem.counts.pendingInspection,
                availableQty: modelItem.counts.available,
                defQty: modelItem.counts.defective,
                rsvQty: modelItem.counts.reserved,
                pendingInspectionQty: modelItem.counts.pendingInspection,
                totalQty: modelItem.counts.total,
              };
            }),
          nextSteps: [
            {
              label: "Open Stock units",
              href: `/inventory?branch=${resolvedBranchId}`,
            },
            {
              label: "Open Order Analytics to restock",
              href: "/orders/manual?tab=analytics",
            },
          ],
        });
      },
    }),

    explainShelfGaps: tool({
      description:
        "Explain shelf gaps / SUG for a branch using planogram Shelf max and STK. Suggested order qty / SUG = Shelf max − on-hand (STK) (= Math.max(0, Shelf max − STK)). Say Shelf max never maxQty. Omit branchId when Context Active branch is set.",
      inputSchema: z.object({
        branchId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Branch id or SAP code from permitted branches. Prefer Active branchId from context when set.",
          ),
        brandId: z.string().optional().nullable(),
        orderType: z
          .enum(["manual", "special", "auto_replenish"])
          .default("manual")
          .describe("Order type analytics context"),
      }),
      execute: async ({ branchId, brandId, orderType }) => {
        if (!canPlanogram && !canOrders && !sampleMode) {
          return { error: "You do not have order analytics or planogram access." };
        }
        const ref = resolveBranchArg(branchId);
        if (!ref) {
          return {
            error:
              "No branch selected. Set Context branch, pass a branch id/SAP code, or call listPermittedBranches.",
          };
        }
        const access = await assertPermittedBranch(session, ref);
        if (!access.ok) return { error: access.error };

        const resolvedBranchId = access.branch.id;
        const branchPayload = {
          id: access.branch.id,
          name: access.branch.name,
          sapCode: access.branch.sapCode,
        };

        if (sampleMode) {
          return truncatePayload({
            ...SAMPLE_SHELF_GAPS,
            branch: branchPayload,
          });
        }

        try {
          const analytics = await orderAnalyticsService.getAnalytics(
            session.user.tenantId,
            {
              branchId: resolvedBranchId,
              brandId: brandId ?? null,
              orderType,
            },
          );

          const lines = analytics.lines
            .map((line) => {
              const sugQty = computeSugQty(line.maxQty, line.stkQty);
              return {
                modelId: line.modelId,
                skuCode: line.skuCode,
                name: line.name,
                maxQty: line.maxQty,
                shelfMax: line.maxQty,
                stkQty: line.stkQty,
                sugQty,
                remainingCapacity: line.remainingCapacity,
                onPlanogram: line.onPlanogram,
              };
            })
            .filter((line) => line.sugQty > 0)
            .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems);

          const orderTypePath =
            orderType === "auto_replenish" ? "auto-replenish" : orderType;
          const analyticsHref = `/orders/${orderTypePath}?tab=analytics`;

          return truncatePayload({
            sample: false,
            retrievedAt: retrievedAt(),
            formula:
              "Suggested order qty / SUG = Shelf max − on-hand (STK) (= Math.max(0, Shelf max − STK))",
            sourceHref: analyticsHref,
            branch: {
              id: access.branch.id,
              name: analytics.branchName,
              sapCode: access.branch.sapCode,
            },
            brandId: analytics.brandId,
            lines,
            note:
              lines.length === 0
                ? "No positive shelf gaps found for this filter."
                : undefined,
            nextSteps: [
              {
                label: "Open Order Analytics, then Proceed to order or Create order",
                href: analyticsHref,
              },
            ],
          });
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "Could not load shelf gap analytics. Pick a brand if the screen requires one.",
          };
        }
      },
    }),

    findOrderStatus: tool({
      description:
        "Find permitted order status by order number (or partial match). Returns status labels and deep links.",
      inputSchema: z.object({
        orderNumber: z.string().min(2).max(80).describe("Order / SO number to look up"),
      }),
      execute: async ({ orderNumber }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_ORDER_STATUS);
        }
        if (!canOrders) {
          return { error: "You do not have order view permission." };
        }

        const tenantId = session.user.tenantId;
        const fullAccess =
          hasPermission(permissions, "branches.manage") ||
          hasAnyOrderPermission(permissions, "approve");
        const branchIds = fullAccess ? null : await getUserBranchIds(tenantId, session.user.id);

        const where = {
          tenantId,
          orderNumber: { contains: orderNumber.trim(), mode: "insensitive" as const },
          ...(branchIds && branchIds.length > 0 ? { branchId: { in: branchIds } } : {}),
          ...(branchIds && branchIds.length === 0 ? { branchId: { in: [] as string[] } } : {}),
        };

        const orders = await prisma.branchOrder.findMany({
          where,
          take: 10,
          orderBy: { updatedAt: "desc" },
          include: {
            branch: { select: { id: true, name: true } },
            approvalLevels: {
              orderBy: { level: "asc" },
              select: {
                level: true,
                roleSlug: true,
                approvedAt: true,
                rejectedAt: true,
                comment: true,
              },
            },
          },
        });

        if (orders.length === 0) {
          return {
            retrievedAt: retrievedAt(),
            orders: [],
            note: "No matching orders in your access scope.",
            sourceHref: "/orders",
          };
        }

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          orders: orders.map((order) => {
            const typePath =
              order.orderType === "auto_replenish"
                ? "auto-replenish"
                : order.orderType === "special"
                  ? "special"
                  : "manual";
            return {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              statusLabel: BRANCH_ORDER_STATUS_LABELS[order.status] ?? order.status,
              orderType: order.orderType,
              branchId: order.branch.id,
              branchName: order.branch.name,
              href: `/orders/${typePath}`,
              history: order.approvalLevels.map((level) => ({
                level: level.level,
                role: level.roleSlug,
                approvedAt: level.approvedAt?.toISOString() ?? null,
                rejectedAt: level.rejectedAt?.toISOString() ?? null,
                comment: level.comment,
              })),
            };
          }),
        });
      },
    }),

    explainReturns: tool({
      description:
        "Explain how Returns / Replacement works using verified Help and the Returns module guide. Does not invent ATR steps.",
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
              "You do not have Returns access. Ask an admin for returns permissions, or open Help.",
            sourceHref: "/help",
          };
        }

        const hits = searchHelpCorpus(query, 6).filter(
          (hit) =>
            hit.href?.includes("/returns") ||
            hit.title.toLowerCase().includes("return") ||
            hit.excerpt.toLowerCase().includes("return"),
        );

        return truncatePayload({
          sample: sampleMode,
          label: sampleMode ? "SAMPLE / HELP CORPUS ONLY" : undefined,
          retrievedAt: retrievedAt(),
          sourceHref: "/returns",
          moduleGuide: {
            title: RETURNS_MODULE_GUIDE.title,
            description: RETURNS_MODULE_GUIDE.description,
            tips: RETURNS_MODULE_GUIDE.tips.map((tip) => tip.label),
          },
          helpHits: hits.map((hit) => ({
            title: hit.title,
            href: hit.href,
            excerpt: hit.excerpt,
          })),
          formatted: formatHelpHitsForPrompt(hits.length > 0 ? hits : searchHelpCorpus("returns", 4)),
          limitation:
            "For a specific ATR / RS / transaction number, call findReturnStatus. Open /returns for full queues.",
        });
      },
    }),
  };
}

