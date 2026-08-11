import { z } from "zod";

import { updateUserSchema } from "@/features/users/schemas/update-user.schema";

export const createTenantWithAdminSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required"),
  adminName: z.string().min(2, "Admin name is required"),
  adminEmail: z.string().email("Enter a valid admin email"),
  adminPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain a symbol"),
});

export const tenantIdSchema = z.object({
  tenantId: z.string().min(1, "Tenant is required"),
});

export const updateProviderCustomerBrandingSchema = z.object({
  tenantId: z.string().min(1, "Tenant is required"),
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(80, "Organization name must be 80 characters or fewer"),
  tagline: z
    .string()
    .trim()
    .max(120, "Tagline must be 120 characters or fewer"),
  logo: z
    .string()
    .trim()
    .max(200_000, "Logo value is too long")
    .optional()
    .nullable()
    .refine(
      (value) =>
        value == null ||
        value === "" ||
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("data:image/"),
      "Enter a valid http(s) or data image URL",
    ),
});

export const createProviderCustomerUserSchema = z.object({
  tenantId: z.string().min(1, "Tenant is required"),
  email: z.string().email("Enter a valid email"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleSlug: z.string().min(1, "Role is required"),
  departmentId: z.string().optional().nullable(),
});

export const updateProviderCustomerUserSchema = updateUserSchema.extend({
  tenantId: z.string().min(1, "Tenant is required"),
});

export const deleteProviderCustomerUserSchema = z.object({
  tenantId: z.string().min(1, "Tenant is required"),
  userId: z.string().min(1, "User is required"),
});

export type CreateTenantWithAdminInput = z.infer<
  typeof createTenantWithAdminSchema
>;
export type UpdateProviderCustomerBrandingInput = z.infer<
  typeof updateProviderCustomerBrandingSchema
>;
export type CreateProviderCustomerUserInput = z.infer<
  typeof createProviderCustomerUserSchema
>;
export type UpdateProviderCustomerUserInput = z.infer<
  typeof updateProviderCustomerUserSchema
>;
export type DeleteProviderCustomerUserInput = z.infer<
  typeof deleteProviderCustomerUserSchema
>;
