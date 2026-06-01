import { z } from "zod";

import {
  isProviderOnlyRole,
  slugifyRoleName,
} from "@/features/roles/constants/role.constants";

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  description: z
    .string()
    .trim()
    .max(200, "Description is too long")
    .optional()
    .nullable(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9_]+$/, "Slug must use lowercase letters, numbers, and underscores")
    .optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export function resolveRoleSlug(input: CreateRoleInput) {
  const slug = input.slug?.trim() || slugifyRoleName(input.name);
  if (!slug) {
    throw new Error("Could not generate a valid slug");
  }
  if (isProviderOnlyRole(slug)) {
    throw new Error("This slug is reserved");
  }
  return slug;
}
