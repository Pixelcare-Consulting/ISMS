import { z } from "zod";

import { POLICY_STATUSES } from "@/features/policies/constants/policy-status";

export const policyTitleSchema = z
  .string()
  .trim()
  .min(2, "Title must be at least 2 characters")
  .max(120, "Title must be 120 characters or fewer");

export const policyContentSchema = z
  .string()
  .trim()
  .min(1, "Content is required")
  .max(50000, "Content is too long");

export const createPolicySchema = z.object({
  title: policyTitleSchema,
  description: z.string().trim().max(500).optional(),
  content: policyContentSchema,
});

export const updatePolicySchema = z.object({
  policyId: z.string().min(1),
  title: policyTitleSchema,
  description: z.string().trim().max(500).optional(),
  content: policyContentSchema,
});

export const createRevisionSchema = z.object({
  policyId: z.string().min(1),
  title: policyTitleSchema.optional(),
  description: z.string().trim().max(500).optional(),
  content: policyContentSchema.optional(),
});

export const policyWorkflowCommentSchema = z.object({
  policyId: z.string().min(1),
  comment: z.string().trim().max(2000).optional(),
  reviewerId: z.string().optional(),
});

export const policyStatusSchema = z.enum(POLICY_STATUSES);

export const POLICY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const POLICY_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
] as const;
