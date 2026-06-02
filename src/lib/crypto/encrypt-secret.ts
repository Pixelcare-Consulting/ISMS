import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

const KEY_SALT = "isms-sap-service-layer-v1";

function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
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
  const buffer = Buffer.from(ciphertext, "base64");
  if (buffer.length < 29) {
    return ciphertext;
  }
  try {
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return ciphertext;
  }
}
