import { z } from "zod";

const profileImageSchema = z
  .string()
  .max(200_000, "Image is too large")
  .refine(
    (value) =>
      value.startsWith("data:image/jpeg") ||
      value.startsWith("data:image/png") ||
      value.startsWith("data:image/webp") ||
      value.startsWith("http://") ||
      value.startsWith("https://"),
    "Invalid image format",
  );

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  image: profileImageSchema.optional().nullable(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
