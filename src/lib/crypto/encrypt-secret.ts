import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

const KEY_SALT = "isms-sap-service-layer-v1";

function getEncryptionKey(): Buffer {
  // Prefer a dedicated key so credential encryption is decoupled from the JWT
  // signing secret. Falls back to AUTH_SECRET for backward compatibility with
  // already-encrypted data (rotate by setting SAP_ENCRYPTION_KEY + re-encrypting).
  const secret = process.env.SAP_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("SAP_ENCRYPTION_KEY or AUTH_SECRET must be configured");
  }
  return scryptSync(secret, KEY_SALT, 32);
}

/** SHA-256 fingerprint for audit logs (never store raw secrets). */
export function fingerprintSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

/**
 * Encrypt a config value for at-rest storage (AES-256-GCM).
 * SAP credentials must remain reversible for Service Layer login.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  if (ciphertext === "") return "";

  const buffer = Buffer.from(ciphertext, "base64");
  if (buffer.length < 29) {
    // Too short to be a valid iv|tag|payload envelope. For a credential vault we
    // fail loudly rather than silently handing back unusable data.
    throw new Error("Stored secret is not in the expected encrypted format");
  }

  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  // A wrong key or tampered data throws here (GCM auth-tag mismatch) — let it
  // propagate so misconfiguration/tampering surfaces instead of leaking garbage.
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
