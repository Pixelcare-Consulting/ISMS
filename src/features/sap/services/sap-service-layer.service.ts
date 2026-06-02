import { auditService } from "@/features/audit/services/audit.service";
import { sapServiceLayerRepository } from "@/features/sap/repositories/sap-service-layer.repository";
import type {
  SapServiceLayerInput,
  SapServiceLayerSettings,
} from "@/features/sap/schemas/sap-service-layer.schema";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} from "@/lib/crypto/encrypt-secret";

export interface SapServiceLayerCredentials {
  id: string;
  baseUrl: string;
  companyDb: string;
  username: string;
  password: string;
  isEnabled: boolean;
  verifySsl: boolean;
  languageCode: string;
}

type ConfigRow = NonNullable<
  Awaited<ReturnType<typeof sapServiceLayerRepository.listByTenant>>[number]
>;

function decryptField(stored: string): string {
  return decryptSecret(stored);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function postJson(
  targetUrl: string,
  payload: Record<string, unknown>,
  verifySsl: boolean,
  headers?: Record<string, string>,
) {
  return new Promise<{ statusCode: number; body: string; headers: IncomingHttpHeaders }>(
    (resolve, reject) => {
      const url = new URL(targetUrl);
      const body = JSON.stringify(payload);
      const isHttps = url.protocol === "https:";
      const requestFn = isHttps ? httpsRequest : httpRequest;

      const req = requestFn(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          method: "POST",
          rejectUnauthorized: isHttps ? verifySsl : undefined,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...headers,
          },
        },
        (res) => {
          let responseBody = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            responseBody += chunk;
          });
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              body: responseBody,
              headers: res.headers,
            });
          });
        },
      );

      req.on("error", reject);
      req.write(body);
      req.end();
    },
  );
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

    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const loginUrl = `${baseUrl}/Login`;
    const logoutUrl = `${baseUrl}/Logout`;
    const verifySsl = input.verifySsl ?? true;
    const languageCode = input.languageCode?.trim() || "23";

    const loginPayload = {
      CompanyDB: input.companyDb.trim(),
      UserName: input.username.trim(),
      Password: passwordPlain,
      Language: Number(languageCode),
    };

    let loginResponse: { statusCode: number; body: string; headers: IncomingHttpHeaders };
    try {
      loginResponse = await postJson(loginUrl, loginPayload, verifySsl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      const isSelfSignedError = /self[- ]signed certificate/i.test(message);
      if (!verifySsl || !isSelfSignedError) throw error;

      // Auto-fallback for environments using self-signed certificates.
      loginResponse = await postJson(loginUrl, loginPayload, false);
    }

    if (loginResponse.statusCode < 200 || loginResponse.statusCode >= 300) {
      throw new Error(
        `Connection failed (${loginResponse.statusCode}): ${loginResponse.body || "Unknown SAP response"}`,
      );
    }

    let json: { SessionId?: string };
    try {
      json = JSON.parse(loginResponse.body) as { SessionId?: string };
    } catch {
      throw new Error("Connection failed: SAP response is not valid JSON");
    }
    if (!json?.SessionId) throw new Error("Connection failed: SAP did not return a session id");

    const setCookieRaw = loginResponse.headers["set-cookie"];
    const setCookie = Array.isArray(setCookieRaw) ? setCookieRaw.join("; ") : setCookieRaw;
    if (setCookie) {
      await postJson(logoutUrl, {}, verifySsl, { Cookie: setCookie }).catch(() => undefined);
    }

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
};
