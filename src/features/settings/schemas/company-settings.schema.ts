import { z } from "zod";

import {
  DOCUMENT_HEADER_MAX_LENGTH,
  DOCUMENT_HEADER_MAX_LINES,
  splitDocumentHeader,
} from "@/features/tenants/types/tenant-branding";

const companyLogoSchema = z
  .string()
  .max(200_000, "Image is too large")
  .refine(
    (value) =>
      value.startsWith("data:image/jpeg") ||
      value.startsWith("data:image/png") ||
      value.startsWith("data:image/webp"),
    "Invalid image format",
  );

export const companySettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters")
    .max(80, "Company name must be 80 characters or fewer"),
  tagline: z
    .string()
    .trim()
    .max(120, "Tagline must be 120 characters or fewer"),
  logo: companyLogoSchema.optional().nullable(),
});

export const documentHeaderSchema = z.object({
  documentHeader: z
    .string()
    .max(
      DOCUMENT_HEADER_MAX_LENGTH,
      `Document header must be ${DOCUMENT_HEADER_MAX_LENGTH} characters or fewer`,
    )
    .refine(
      (value) => splitDocumentHeader(value).length <= DOCUMENT_HEADER_MAX_LINES,
      `Use at most ${DOCUMENT_HEADER_MAX_LINES} lines`,
    ),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export const ISMS_TAGLINE_SUGGESTIONS = [
  "Secure your information assets",
  "Compliance made simple",
  "Built for ISO 27001 excellence",
  "Protect. Comply. Succeed.",
  "Your ISMS command center",
] as const;
