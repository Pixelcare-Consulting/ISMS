import { z } from "zod";

export const updatePermissionSchema = z.object({
  permissionId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  description: z
    .string()
    .trim()
    .max(200, "Description is too long")
    .optional()
    .nullable(),
});

export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
