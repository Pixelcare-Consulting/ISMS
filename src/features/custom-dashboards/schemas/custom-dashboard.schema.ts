import { z } from "zod";

export const CUSTOM_DASHBOARD_VISIBILITIES = ["PRIVATE", "TENANT"] as const;
export type CustomDashboardVisibility = (typeof CUSTOM_DASHBOARD_VISIBILITIES)[number];

/** Frontend labels for the backend visibility values (single source). */
export const CUSTOM_DASHBOARD_VISIBILITY_LABELS: Record<CustomDashboardVisibility, string> = {
  PRIVATE: "Only me",
  TENANT: "Shared with my company",
};

/** Saved layouts are a few hundred KB at most; anything bigger is likely embedded data. */
export const MAX_TEMPLATE_BYTES = 2_000_000;

const id = z.string().trim().min(1).max(64);

export const customDashboardDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(CUSTOM_DASHBOARD_VISIBILITIES).default("PRIVATE"),
});

export const updateCustomDashboardDetailsSchema = customDashboardDetailsSchema.extend({ id });

export const saveCustomDashboardTemplateSchema = z.object({
  id,
  template: z.record(z.string(), z.unknown()),
});

export const customDashboardIdSchema = z.object({ id });

export const copyReadyMadeDashboardSchema = z.object({ key: z.string().trim().min(1).max(64) });

export type CustomDashboardDetailsInput = z.input<typeof customDashboardDetailsSchema>;
