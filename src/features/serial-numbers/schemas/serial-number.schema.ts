import { z } from "zod";

import {
  SERIAL_SYNC_TARGET_KINDS,
  SERIAL_SYNC_TARGET_MAX_VALUES,
} from "@/features/serial-numbers/constants/serial-sync-target";

export const serialWriteSchema = z.object({
  serialNo: z.string().trim().min(1, "Serial number is required").max(64),
  modelId: z.string().trim().min(1, "Model is required").max(64),
});

export const serialStatusSchema = z.object({
  recordStatus: z.enum(["active", "inactive"]),
});

/** Serials, or ids of the models / brands / branches / warehouses to re-sync. */
export const serialSyncTargetSchema = z.object({
  kind: z.enum(SERIAL_SYNC_TARGET_KINDS),
  values: z
    .array(z.string().trim().max(64))
    .transform((values) => [...new Set(values.filter(Boolean))])
    .pipe(
      z
        .array(z.string())
        .min(1, "Pick at least one")
        .max(
          SERIAL_SYNC_TARGET_MAX_VALUES,
          `At most ${SERIAL_SYNC_TARGET_MAX_VALUES.toLocaleString()} at a time`,
        ),
    ),
});

export const serialTargetedSyncInputSchema = z.object({
  target: serialSyncTargetSchema,
  /** The `resume` token from the previous slice of the same run. */
  resume: z.string().max(4000).nullish(),
});

export type SerialWriteInput = z.infer<typeof serialWriteSchema>;
export type SerialStatusInput = z.infer<typeof serialStatusSchema>;
export type SerialSyncTarget = z.infer<typeof serialSyncTargetSchema>;
export type SerialTargetedSyncInput = z.input<typeof serialTargetedSyncInputSchema>;
