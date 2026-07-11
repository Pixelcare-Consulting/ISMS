import { z } from "zod";

const optionalExpiresAt = z
  .union([z.coerce.date(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (value === "" || value == null) return null;
    return value;
  });

export const announcementFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(10_000),
  publishedAt: z.coerce.date(),
  expiresAt: optionalExpiresAt,
  isActive: z.boolean().default(true),
});

export const createAnnouncementSchema = announcementFormSchema;

export const updateAnnouncementSchema = announcementFormSchema.extend({
  announcementId: z.string().min(1),
});

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;
