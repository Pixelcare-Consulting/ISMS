import { z } from "zod";

export const notificationAudienceSchema = z.enum(["TENANT", "ROLE", "USER"]);

export const createNotificationSchema = z
  .object({
    audience: notificationAudienceSchema,
    roleSlug: z.string().trim().min(1).max(100).optional().nullable(),
    userId: z.string().trim().min(1).optional().nullable(),
    type: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(5_000).optional().nullable(),
    href: z.string().trim().max(500).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.audience === "ROLE" && !value.roleSlug) {
      ctx.addIssue({
        code: "custom",
        path: ["roleSlug"],
        message: "Role is required for role-targeted notifications",
      });
    }
    if (value.audience === "USER" && !value.userId) {
      ctx.addIssue({
        code: "custom",
        path: ["userId"],
        message: "User is required for user-targeted notifications",
      });
    }
  });

export const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1),
});

export const listMyNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type MarkNotificationReadInput = z.infer<
  typeof markNotificationReadSchema
>;
