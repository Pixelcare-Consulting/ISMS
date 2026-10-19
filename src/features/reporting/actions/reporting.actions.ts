"use server";

import { z } from "zod";

import { DATASET_KEYS, type DatasetKey } from "@/features/reporting/datasets/dataset-catalog";
import { datasetParamsSchema } from "@/features/reporting/schemas/dataset-params.schema";
import {
  DatasetAccessError,
  loadDataset,
  type LoadedDataset,
} from "@/features/reporting/services/dataset-registry";
import { requireAuth } from "@/lib/auth/permissions";
import { logger } from "@/lib/shared/logger";

const loadDatasetsSchema = z.object({
  keys: z
    .array(z.enum(DATASET_KEYS as [DatasetKey, ...DatasetKey[]]))
    .min(1)
    .max(DATASET_KEYS.length),
  params: datasetParamsSchema.default({}),
  /** Skip datasets the caller cannot open instead of failing (dashboards). */
  skipDenied: z.boolean().default(false),
});

export type LoadDatasetsInput = z.input<typeof loadDatasetsSchema>;

export type LoadDatasetsResult =
  | { success: true; datasets: Partial<Record<DatasetKey, LoadedDataset>>; denied: DatasetKey[] }
  | { success: false; error: string };

/**
 * Single data path for every Stimulsoft report and dashboard. Each dataset
 * re-checks the caller's permissions and AOR on the server; Stimulsoft only
 * ever receives the JSON returned here.
 */
export async function loadDatasetsAction(input: LoadDatasetsInput): Promise<LoadDatasetsResult> {
  const session = await requireAuth();
  const parsed = loadDatasetsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid report filters" };
  }

  const { keys, params, skipDenied } = parsed.data;
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    permissions: session.user.permissions ?? [],
  };

  const uniqueKeys = [...new Set(keys)];
  const datasets: Partial<Record<DatasetKey, LoadedDataset>> = {};
  const denied: DatasetKey[] = [];

  try {
    const results = await Promise.allSettled(
      uniqueKeys.map(async (key) => [key, await loadDataset(key, ctx, params)] as const),
    );

    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        const [key, loaded] = result.value;
        datasets[key] = loaded;
        continue;
      }
      if (result.reason instanceof DatasetAccessError) {
        if (!skipDenied) return { success: false, error: result.reason.message };
        denied.push(uniqueKeys[index]);
        continue;
      }
      throw result.reason;
    }
  } catch (error) {
    logger.error({ err: error, keys, tenantId: ctx.tenantId }, "reporting: dataset load failed");
    return { success: false, error: "Could not load report data" };
  }

  return { success: true, datasets, denied };
}
