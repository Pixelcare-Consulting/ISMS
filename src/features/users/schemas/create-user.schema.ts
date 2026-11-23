import { z } from "zod";

/** Tenant Add user only. A minimum length, not a cap. Profile, register, and the provider dialog keep their own rules. */
export const TENANT_CREATE_USER_PASSWORD_MIN = 6;

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z
    .string()
    .min(
      TENANT_CREATE_USER_PASSWORD_MIN,
      `Password must be at least ${TENANT_CREATE_USER_PASSWORD_MIN} characters`,
    ),
  roleSlugs: z.array(z.string().min(1)).min(1, "At least one role is required"),
  departmentId: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
