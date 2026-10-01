import { decryptSecret, encryptSecret, fingerprintSecret } from "@/lib/crypto/encrypt-secret";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, SAP_ENCRYPTION_KEY: "unit-test-key", AUTH_SECRET: undefined };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext", () => {
    const secret = "S4P-p@ssw0rd/with symbols ✓";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("uses a random IV so the same input never encrypts identically", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("treats an empty ciphertext as an empty secret", () => {
    expect(decryptSecret("")).toBe("");
  });

  it("rejects payloads that are not an iv|tag|data envelope", () => {
    expect(() => decryptSecret(Buffer.from("short").toString("base64"))).toThrow(/expected encrypted format/);
  });

  it("fails loudly when decrypting with a different key", () => {
    const ciphertext = encryptSecret("top secret");
    process.env.SAP_ENCRYPTION_KEY = "another-key";
    expect(() => decryptSecret(ciphertext)).toThrow();
  });

  it("falls back to AUTH_SECRET and throws when neither key is set", () => {
    process.env.SAP_ENCRYPTION_KEY = undefined;
    process.env.AUTH_SECRET = "legacy";
    expect(decryptSecret(encryptSecret("x"))).toBe("x");

    process.env.AUTH_SECRET = undefined;
    expect(() => encryptSecret("x")).toThrow(/must be configured/);
  });
});

describe("fingerprintSecret", () => {
  it("is deterministic, short and never the raw value", () => {
    const fp = fingerprintSecret("hunter2");
    expect(fp).toBe(fingerprintSecret("hunter2"));
    expect(fp).toHaveLength(16);
    expect(fp).not.toContain("hunter2");
  });
});
