import { z } from "zod";

/** Optional new password on edit. Minimum length only; longer passwords stay allowed. */
export const UPDATE_USER_PASSWORD_MIN = 6;

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  roleSlugs: z.array(z.string().min(1)).min(1, "At least one role is required"),
  departmentId: z.string().optional().nullable(),
  password: z
    .string()
    .optional()
    .refine((value) => !value || value.length >= UPDATE_USER_PASSWORD_MIN, {
      message: `Password must be at least ${UPDATE_USER_PASSWORD_MIN} characters`,
    }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
