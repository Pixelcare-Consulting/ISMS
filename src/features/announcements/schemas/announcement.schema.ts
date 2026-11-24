import { z } from "zod";

import { parseAnnouncementDateTime } from "@/features/announcements/lib/announcement-schedule";

/**
 * Form clock times have no zone. `z.coerce.date()` would read them in the server
 * zone, so a Manila "now" is stored eight hours ahead on a UTC host and stays
 * off Overview. Interpret the wall clock as Asia/Manila instead.
 * Dates and zoned ISO strings are already instants and are left unchanged.
 */
function manilaDateTimeInput(value: unknown): Date | unknown {
  const parsed = parseAnnouncementDateTime(value);
  return parsed ?? value;
}

/**
 * Empty / cleared expiry must stay optional.
 * Do not lead with `z.coerce.date()`: `new Date(null)` is epoch (1970), which then
 * falsely fails the "after publish date" check.
 */
const optionalExpiresAt = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return manilaDateTimeInput(value);
}, z.date().nullable());

/** Rich HTML body from TipTap (images are uploaded URLs, not base64). */
export const announcementFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(50_000),
  publishedAt: z.preprocess(manilaDateTimeInput, z.date()),
  expiresAt: optionalExpiresAt,
  isActive: z.boolean().default(true),
});

export const createAnnouncementSchema = announcementFormSchema;

export const updateAnnouncementSchema = announcementFormSchema.extend({
  announcementId: z.string().min(1),
});

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;
