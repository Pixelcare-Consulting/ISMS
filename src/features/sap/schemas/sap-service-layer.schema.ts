import { z } from "zod";

export const sapServiceLayerSchema = z.object({
  baseUrl: z
    .string()
    .min(1, "Service Layer URL is required")
    .url("Enter a valid URL (e.g. https://serverhost:50000/b1s/v1)"),
  companyDb: z.string().min(1, "Company database is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().optional(),
  isEnabled: z.boolean().optional(),
  verifySsl: z.boolean().optional(),
  languageCode: z.string().min(1).optional(),
});

export type SapServiceLayerInput = z.infer<typeof sapServiceLayerSchema>;

export interface SapServiceLayerSettings {
  baseUrl: string;
  companyDb: string;
  username: string;
  hasPassword: boolean;
  isEnabled: boolean;
  verifySsl: boolean;
  languageCode: string;
  updatedAt: string | null;
}
