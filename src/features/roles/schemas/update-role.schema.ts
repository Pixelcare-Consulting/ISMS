import { z } from "zod";

export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  description: z
    .string()
    .trim()
    .max(200, "Description is too long")
    .optional()
    .nullable(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
