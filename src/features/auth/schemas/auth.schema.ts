import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
