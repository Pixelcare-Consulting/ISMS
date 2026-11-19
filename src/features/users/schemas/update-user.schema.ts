import { z } from "zod";

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  roleSlugs: z.array(z.string().min(1)).min(1, "At least one role is required"),
  departmentId: z.string().optional().nullable(),
  password: z
    .string()
    .optional()
    .refine((value) => !value || value.length >= 8, {
      message: "Password must be at least 8 characters",
    }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
