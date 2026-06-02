import { auditService } from "@/features/audit/services/audit.service";
import { sapServiceLayerRepository } from "@/features/sap/repositories/sap-service-layer.repository";
import type {
  SapServiceLayerInput,
  SapServiceLayerSettings,
} from "@/features/sap/schemas/sap-service-layer.schema";
import {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} from "@/lib/crypto/encrypt-secret";

export interface SapServiceLayerCredentials {
  baseUrl: string;
  companyDb: string;
  username: string;
  password: string;
  isEnabled: boolean;
  verifySsl: boolean;
  languageCode: string;
}

type ConfigRow = NonNullable<
  Awaited<ReturnType<typeof sapServiceLayerRepository.findByTenant>>
>;

function decryptField(stored: string): string {
  return decryptSecret(stored);
}

function decryptRow(row: ConfigRow): SapServiceLayerCredentials {
  return {
    baseUrl: decryptField(row.baseUrlEncrypted),
    companyDb: decryptField(row.companyDbEncrypted),
    username: decryptField(row.usernameEncrypted),
    password: decryptField(row.passwordEncrypted),
    isEnabled: row.isEnabled,
    verifySsl: row.verifySsl,
    languageCode: row.languageCode,
  };
}

function toPublicSettings(row: ConfigRow): SapServiceLayerSettings {
  const creds = decryptRow(row);
  return {
    baseUrl: creds.baseUrl,
    companyDb: creds.companyDb,
    username: creds.username,
    hasPassword: Boolean(row.passwordEncrypted),
    isEnabled: row.isEnabled,
    verifySsl: row.verifySsl,
    languageCode: row.languageCode,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const sapServiceLayerService = {
  async getSettings(tenantId: string): Promise<SapServiceLayerSettings | null> {
    const row = await sapServiceLayerRepository.findByTenant(tenantId);
    return row ? toPublicSettings(row) : null;
  },

  /** Server-only: decrypted credentials for SAP Service Layer HTTP client. */
  async getCredentials(tenantId: string): Promise<SapServiceLayerCredentials | null> {
    const row = await sapServiceLayerRepository.findByTenant(tenantId);
    if (!row || !row.isEnabled) return null;
    return decryptRow(row);
  },

  async saveSettings(
    tenantId: string,
    userId: string,
    input: SapServiceLayerInput,
  ) {
    const existing = await sapServiceLayerRepository.findByTenant(tenantId);

    if (!input.password && !existing) {
      throw new Error("Password is required for initial Service Layer setup");
    }

    const passwordPlain = input.password
      ? input.password
      : existing
        ? decryptField(existing.passwordEncrypted)
        : "";

    if (!passwordPlain) {
      throw new Error("Password is required");
    }

    const baseUrl = input.baseUrl.replace(/\/$/, "");
    const companyDb = input.companyDb.trim();
    const username = input.username.trim();

    const row = await sapServiceLayerRepository.upsert(tenantId, {
      baseUrlEncrypted: encryptSecret(baseUrl),
      companyDbEncrypted: encryptSecret(companyDb),
      usernameEncrypted: encryptSecret(username),
      passwordEncrypted: encryptSecret(passwordPlain),
      isEnabled: input.isEnabled ?? false,
      verifySsl: input.verifySsl ?? true,
      languageCode: input.languageCode?.trim() || "23",
    });

    await auditService.log({
      tenantId,
      userId,
      action: "sap.service_layer.updated",
      entityType: "SapServiceLayerConfig",
      entityId: row.id,
      metadata: {
        isEnabled: row.isEnabled,
        verifySsl: row.verifySsl,
        languageCode: row.languageCode,
        baseUrlFingerprint: fingerprintSecret(baseUrl),
        companyDbFingerprint: fingerprintSecret(companyDb),
        usernameFingerprint: fingerprintSecret(username),
        passwordUpdated: Boolean(input.password),
      },
    });

    return toPublicSettings(row);
  },
};
