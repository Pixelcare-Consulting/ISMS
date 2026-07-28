/**
 * Shared SAP Service Layer credential shapes (server-only).
 * Kept separate from the settings service to avoid circular imports with the HTTP client.
 */

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

/** Minimal credentials for ad-hoc login (e.g. connection test without a saved config id). */
export type SapLoginInput = Pick<
  SapServiceLayerCredentials,
  "baseUrl" | "companyDb" | "username" | "password" | "verifySsl" | "languageCode"
> & { id?: string };

/** Public session status for UI (never includes cookies or full session id). */
export type SapSessionPublicStatus =
  | { state: "no_config" }
  | { state: "idle"; configId: string; companyDb: string }
  | {
      state: "connected";
      configId: string;
      companyDb: string;
      sessionIdMasked: string;
      expiresAt: number;
    };
