import { z } from "zod";

/**
 * Empty / cleared expiry must stay optional.
 * Do not lead with `z.coerce.date()`: `new Date(null)` is epoch (1970), which then
 * falsely fails the "after publish date" check.
 */
const optionalExpiresAt = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return value;
}, z.coerce.date().nullable());

/** Rich HTML body from TipTap (images are uploaded URLs, not base64). */
export const announcementFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(50_000),
  publishedAt: z.coerce.date(),
  expiresAt: optionalExpiresAt,
  isActive: z.boolean().default(true),
});

export const createAnnouncementSchema = announcementFormSchema;

export const updateAnnouncementSchema = announcementFormSchema.extend({
  announcementId: z.string().min(1),
});

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;
