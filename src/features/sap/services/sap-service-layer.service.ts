import { auditService } from "@/features/audit/services/audit.service";
import { sapServiceLayerRepository } from "@/features/sap/repositories/sap-service-layer.repository";
import type {
  SapServiceLayerInput,
  SapServiceLayerSettings,
} from "@/features/sap/schemas/sap-service-layer.schema";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import {
  normalizeBaseUrl,
  SESSION_SKEW_MS,
  sapSessionManager,
} from "@/features/sap/services/sap-session-manager";
import type {
  SapServiceLayerCredentials,
  SapSessionPublicStatus,
} from "@/features/sap/types/sap-service-layer";
import {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} from "@/lib/crypto/encrypt-secret";

export type { SapServiceLayerCredentials, SapSessionPublicStatus };

function maskSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (!trimmed) return "…";
  const last4 = trimmed.slice(-4);
  return `…${last4}`;
}

async function toPublicSessionStatus(
  configId: string,
  companyDb: string,
): Promise<SapSessionPublicStatus> {
  const cached = await sapSessionManager.getCached(configId);
  const now = Date.now();
  if (!cached || cached.expiresAt <= now + SESSION_SKEW_MS) {
    return { state: "idle", configId, companyDb };
  }
  return {
    state: "connected",
    configId,
    companyDb,
    sessionIdMasked: maskSessionId(cached.sessionId),
    expiresAt: cached.expiresAt,
  };
}

type ConfigRow = NonNullable<
  Awaited<ReturnType<typeof sapServiceLayerRepository.listByTenant>>[number]
>;

function decryptField(stored: string): string {
  return decryptSecret(stored);
}

function decryptRow(row: ConfigRow): SapServiceLayerCredentials {
  return {
    id: row.id,
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
    id: row.id,
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
  async listSettings(tenantId: string): Promise<SapServiceLayerSettings[]> {
    const rows = await sapServiceLayerRepository.listByTenant(tenantId);
    return rows.map((row) => toPublicSettings(row));
  },

  /** Server-only: decrypted credentials for SAP Service Layer HTTP client. */
  async getCredentials(tenantId: string): Promise<SapServiceLayerCredentials | null> {
    const row = await sapServiceLayerRepository.findEnabledByTenant(tenantId);
    if (!row) return null;
    return decryptRow(row);
  },

  async saveSettings(
    tenantId: string,
    userId: string,
    input: SapServiceLayerInput,
  ) {
    const passwordPlain = input.password ?? "";

    if (!passwordPlain) {
      throw new Error("Password is required for new Service Layer connection");
    }

    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const companyDb = input.companyDb.trim();
    const username = input.username.trim();

    const row = await sapServiceLayerRepository.create(tenantId, {
      baseUrlEncrypted: encryptSecret(baseUrl),
      companyDbEncrypted: encryptSecret(companyDb),
      usernameEncrypted: encryptSecret(username),
      passwordEncrypted: encryptSecret(passwordPlain),
      isEnabled: input.isEnabled ?? false,
      verifySsl: input.verifySsl ?? true,
      languageCode: input.languageCode?.trim() || "23",
    });

    if (row.isEnabled) {
      await sapServiceLayerRepository.setActiveStatus(row.id, tenantId, true);
    }

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

  async updateSettings(
    tenantId: string,
    userId: string,
    configId: string,
    input: SapServiceLayerInput,
  ) {
    const existing = await sapServiceLayerRepository.findByIdForTenant(configId, tenantId);
    if (!existing) throw new Error("Service Layer configuration not found");

    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const companyDb = input.companyDb.trim();
    const username = input.username.trim();
    const passwordPlain = input.password?.trim();

    const updateResult = await sapServiceLayerRepository.update(configId, tenantId, {
      baseUrlEncrypted: encryptSecret(baseUrl),
      companyDbEncrypted: encryptSecret(companyDb),
      usernameEncrypted: encryptSecret(username),
      ...(passwordPlain ? { passwordEncrypted: encryptSecret(passwordPlain) } : {}),
      isEnabled: input.isEnabled ?? false,
      verifySsl: input.verifySsl ?? true,
      languageCode: input.languageCode?.trim() || "23",
    });
    if (updateResult.count === 0) throw new Error("Failed to update Service Layer configuration");

    if (input.isEnabled) {
      await sapServiceLayerRepository.setActiveStatus(configId, tenantId, true);
    }

    await sapSessionManager.invalidate(configId);

    const updated = await sapServiceLayerRepository.findByIdForTenant(configId, tenantId);
    if (!updated) throw new Error("Service Layer configuration not found after update");

    await auditService.log({
      tenantId,
      userId,
      action: "sap.service_layer.updated",
      entityType: "SapServiceLayerConfig",
      entityId: configId,
      metadata: {
        isEnabled: updated.isEnabled,
        verifySsl: updated.verifySsl,
        languageCode: updated.languageCode,
        baseUrlFingerprint: fingerprintSecret(baseUrl),
        companyDbFingerprint: fingerprintSecret(companyDb),
        usernameFingerprint: fingerprintSecret(username),
        passwordUpdated: Boolean(passwordPlain),
      },
    });

    return toPublicSettings(updated);
  },

  async testConnection(input: SapServiceLayerInput) {
    const startedAt = Date.now();
    const passwordPlain = input.password?.trim();
    if (!passwordPlain) throw new Error("Password is required to test connection");

    const creds = {
      baseUrl: normalizeBaseUrl(input.baseUrl),
      companyDb: input.companyDb.trim(),
      username: input.username.trim(),
      password: passwordPlain,
      verifySsl: input.verifySsl ?? true,
      languageCode: input.languageCode?.trim() || "23",
    };

    const session = await sapServiceLayerClient.login(creds);
    if (!session.sessionId) {
      throw new Error("Connection failed: SAP did not return a session id");
    }

    await sapServiceLayerClient.logout(creds, session.cookies).catch(() => undefined);

    return {
      success: true,
      message: "Connection test succeeded",
      durationMs: Date.now() - startedAt,
    } as const;
  },

  async setActiveStatus(tenantId: string, userId: string, configId: string, isEnabled: boolean) {
    const target = await sapServiceLayerRepository.findByIdForTenant(configId, tenantId);
    if (!target) throw new Error("Service Layer configuration not found");

    await sapServiceLayerRepository.setActiveStatus(configId, tenantId, isEnabled);

    if (!isEnabled) {
      await sapSessionManager.invalidate(configId);
    }

    await auditService.log({
      tenantId,
      userId,
      action: "sap.service_layer.status_updated",
      entityType: "SapServiceLayerConfig",
      entityId: configId,
      metadata: {
        isEnabled,
      },
    });
  },

  async deleteSettings(tenantId: string, userId: string, configId: string) {
    const target = await sapServiceLayerRepository.findByIdForTenant(configId, tenantId);
    if (!target) throw new Error("Service Layer configuration not found");

    const deleted = await sapServiceLayerRepository.delete(configId, tenantId);
    if (deleted.count === 0) throw new Error("Failed to delete Service Layer configuration");

    await sapSessionManager.invalidate(configId);

    await auditService.log({
      tenantId,
      userId,
      action: "sap.service_layer.deleted",
      entityType: "SapServiceLayerConfig",
      entityId: configId,
      metadata: {
        wasEnabled: target.isEnabled,
      },
    });
  },

  /** Public status for the tenant's enabled config (never exposes cookies or full session id). */
  async getSessionStatus(tenantId: string): Promise<SapSessionPublicStatus> {
    const creds = await this.getCredentials(tenantId);
    if (!creds) return { state: "no_config" };
    return toPublicSessionStatus(creds.id, creds.companyDb);
  },

  /** Login and cache a B1 session for a tenant-owned config. */
  async establishSession(tenantId: string, configId: string): Promise<SapSessionPublicStatus> {
    const row = await sapServiceLayerRepository.findByIdForTenant(configId, tenantId);
    if (!row) throw new Error("Service Layer configuration not found");
    if (!row.isEnabled) throw new Error("Only the active Service Layer configuration can connect");

    const creds = decryptRow(row);
    await sapServiceLayerClient.login({ ...creds, id: creds.id });
    return toPublicSessionStatus(creds.id, creds.companyDb);
  },

  /** Logout and clear the cached session for a tenant-owned config. */
  async logoutSession(tenantId: string, configId: string): Promise<SapSessionPublicStatus> {
    const row = await sapServiceLayerRepository.findByIdForTenant(configId, tenantId);
    if (!row) throw new Error("Service Layer configuration not found");

    const creds = decryptRow(row);
    await sapServiceLayerClient.logout({ ...creds, id: creds.id });
    return { state: "idle", configId: creds.id, companyDb: creds.companyDb };
  },
};
