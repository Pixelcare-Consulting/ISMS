import { z } from "zod";

const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalPromotion = z
  .string()
  .trim()
  .max(255)
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

export const competitorListFilterSchema = z.object({
  branchId: optionalId,
  competitorBrandId: optionalId,
  competitorName: z.string().trim().max(120).optional().nullable(),
  from: z.string().datetime({ offset: true }).optional().nullable().or(z.literal("")),
  to: z.string().datetime({ offset: true }).optional().nullable().or(z.literal("")),
});

export const createCompetitorObservationSchema = z.object({
  competitorId: z.string().trim().min(1, "Competitor is required"),
  competitorBrandId: optionalId,
  competitorModelId: optionalId,
  price: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .pipe(z.number().nonnegative().nullable()),
  promotion: optionalPromotion,
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  // No observedAt: the server stamps it on create and never changes it.
});

export const updateCompetitorObservationSchema = createCompetitorObservationSchema.extend({
  id: z.string().min(1),
});

const reportDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .optional()
  .nullable()
  .transform((v) => v || null);

/** Query string of the Competitors report export. Every field is optional. */
export const competitorReportQuerySchema = z
  .object({
    from: reportDay,
    to: reportDay,
    branchId: optionalId,
    competitorBrandId: optionalId,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "From date must be on or before To date",
    path: ["to"],
  });

export type CreateCompetitorObservationInput = z.infer<typeof createCompetitorObservationSchema>;
export type UpdateCompetitorObservationInput = z.infer<typeof updateCompetitorObservationSchema>;
export type CompetitorListFilterInput = z.infer<typeof competitorListFilterSchema>;
export type CompetitorReportQuery = z.infer<typeof competitorReportQuerySchema>;
