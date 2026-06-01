import { z } from "zod";

import {
  composePermissionSlug,
  getAppModuleById,
  isValidModuleAction,
} from "@/config/app-modules";

export const createPermissionSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    moduleId: z.string().min(1, "Module is required"),
    action: z.string().trim().min(1, "Action is required").max(32),
    description: z
      .string()
      .trim()
      .max(200, "Description is too long")
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (!getAppModuleById(data.moduleId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unknown module",
        path: ["moduleId"],
      });
    }

    if (!isValidModuleAction(data.moduleId, data.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid action for this module",
        path: ["action"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    slug: composePermissionSlug(data.moduleId, data.action),
  }));

export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
