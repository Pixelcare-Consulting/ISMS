import { tool } from "ai";
import { z } from "zod";

import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import { computeSugQty } from "@/features/pixelcare-ai/lib/sug";
import {
  confirmReplenishmentProposal,
  prepareReplenishmentProposalForUser,
} from "@/features/pixelcare-ai/automations/replenishment";
import { PROPOSED_NOT_CREATED } from "@/features/pixelcare-ai/automations/proposal-lines";
import {
  assertPermittedBranch,
  isUnrestrictedBranchAccess,
  listPermittedBranches as fetchPermittedBranches,
} from "@/features/pixelcare-ai/tools/branch-access";
import { findOrderStatuses } from "@/features/pixelcare-ai/tools/find-order-status";
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
import { buildWorkflowOpsTools } from "@/features/pixelcare-ai/tools/workflow-ops-tools";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { hasAnyOrderPermission, hasOrderPermission } from "@/features/orders/constants/order-permissions";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import type { InventoryGroupModelSummary } from "@/features/inventory/services/inventory.service";

export function buildPixelcareAiTools(
  session: AppSession,
  options?: {
    defaultBranchId?: string | null;
    /** SO numbers already present in the latest user message. */
    messageOrderNumbers?: readonly string[];
  },
) {
  const sampleMode = isPixelcareAiSampleMode();
  const permissions = session.user.permissions;
  const defaultBranchId = options?.defaultBranchId?.trim() || null;
  const messageOrderNumbers = options?.messageOrderNumbers ?? [];
  const canInventory = hasPermission(permissions, "inventory.view");
  const canOrders = hasAnyOrderPermission(permissions, "view");
  const canPlanogram =
    hasPermission(permissions, "planogram.view") ||
    hasPermission(permissions, "planogram.manage") ||
    hasAnyOrderPermission(permissions, "view");

  function resolveBranchArg(branchId?: string | null): string | null {
    const explicit = branchId?.trim();
    if (explicit) return explicit;
    return defaultBranchId;
  }

  return {
    ...buildPlanningOpsTools(session),
    ...buildWorkflowOpsTools(session, { defaultBranchId }),

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
        "Look up permitted order status for one or more sales order numbers. Pass orderNumbers when the user already gave SO#YYYY-MM-##### values and keep the #. orderNumber still accepts a single number or partial match. Returns each number as a hit (status and deep link) or an explicit miss. Never invent a status.",
      inputSchema: z.object({
        orderNumber: z
          .string()
          .max(80)
          .nullish()
          .describe("Single order / SO number, including partial match. Optional when orderNumbers is set."),
        orderNumbers: z
          .array(z.string().max(80))
          .max(10)
          .nullish()
          .describe(
            "Sales order numbers already in the user message. Keep the # (SO#YYYY-MM-#####).",
          ),
      }),
      execute: async ({ orderNumber, orderNumbers }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_ORDER_STATUS);
        }
        if (!canOrders) {
          return { error: "You do not have order view permission." };
        }

        const result = await findOrderStatuses({
          tenantId: session.user.tenantId,
          userId: session.user.id,
          permissions,
          orderNumber,
          orderNumbers,
          fromMessage: messageOrderNumbers,
        });
        if ("error" in result) return result;
        return truncatePayload(result);
      },
    }),

    prepareReplenishmentProposal: tool({
      description:
        "Read shelf gaps and save a replenishment proposal only. SUG = Shelf max − STK. Returns quantities, reasons, links, and exceptions with the label Proposed — not created. Does not create, submit, approve, or send an order.",
      inputSchema: z.object({
        branchId: z
          .string()
          .min(1)
          .optional()
          .describe("Branch id or SAP code. Prefer the Active branchId when set."),
      }),
      execute: async ({ branchId }) => {
        if (sampleMode) {
          return {
            error: "Sample mode cannot prepare a live replenishment proposal.",
          };
        }
        if (!hasOrderPermission(permissions, "auto_replenish", "create")) {
          return { error: "You do not have permission to create an auto replenish order." };
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
        try {
          const result = await prepareReplenishmentProposalForUser({
            tenantId: session.user.tenantId,
            userId: session.user.id,
            branchId: access.branch.id,
          });
          return truncatePayload({
            ...result,
            label: PROPOSED_NOT_CREATED,
            branch: {
              id: access.branch.id,
              name: access.branch.name,
              sapCode: access.branch.sapCode,
            },
          });
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Could not prepare a proposal.",
          };
        }
      },
    }),

    confirmReplenishmentProposal: tool({
      description:
        "Create one Auto replenish order for a proposal the user has explicitly confirmed. Pass that proposal id only. A repeat call returns the existing order and does not create another. Does not submit, approve, cancel, delete, or post to SAP.",
      inputSchema: z.object({
        proposalId: z.string().min(1).describe("Proposal id the user just confirmed."),
      }),
      execute: async ({ proposalId }) => {
        if (sampleMode) {
          return { error: "Sample mode cannot confirm a live replenishment proposal." };
        }
        if (!hasOrderPermission(permissions, "auto_replenish", "create")) {
          return { error: "You do not have permission to create an auto replenish order." };
        }
        try {
          const result = await confirmReplenishmentProposal({
            tenantId: session.user.tenantId,
            actorUserId: session.user.id,
            proposalId,
          });
          return truncatePayload({
            sample: false,
            retrievedAt: retrievedAt(),
            ...result,
          });
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Could not confirm the proposal.",
          };
        }
      },
    }),

  };
}

