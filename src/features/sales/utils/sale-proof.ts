/** Max proof images/PDFs allowed on one sales transaction. */
export const SALE_PROOF_MAX_FILES = 10;

function isProofPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "null" || trimmed === "undefined") return false;
  // Reject accidental JSON object dumps (not PostgreSQL arrays).
  if (trimmed === "{}" ) return false;
  return true;
}

/**
 * Parse PostgreSQL text-array literal from `proof::text`
 * e.g. `{}`, `{sales-proofs/a.jpg}`, `{a,b}`, `{"a","b"}`.
 */
function parsePostgresTextArray(literal: string): string[] | null {
  const trimmed = literal.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && (inner[i] === " " || inner[i] === ",")) i += 1;
    if (i >= inner.length) break;

    if (inner[i] === '"') {
      i += 1;
      let value = "";
      while (i < inner.length) {
        const ch = inner[i]!;
        if (ch === "\\" && i + 1 < inner.length) {
          value += inner[i + 1]!;
          i += 2;
          continue;
        }
        if (ch === '"') {
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      if (isProofPath(value)) out.push(value.trim());
      continue;
    }

    const start = i;
    while (i < inner.length && inner[i] !== ",") i += 1;
    const value = inner.slice(start, i).trim();
    if (isProofPath(value)) out.push(value);
  }

  return out;
}

/**
 * Normalize stored proof value to path list.
 * Supports:
 * - Prisma `String[]` / JS arrays
 * - JSON arrays (`["a","b"]`) and JSON strings
 * - PostgreSQL text-array literals (`{a,b}`) from `proof::text`
 * - Legacy single path strings
 */
export function parseSaleProofPaths(proof: unknown): string[] {
  if (proof == null) return [];
  if (Array.isArray(proof)) {
    return proof.filter(isProofPath).map((p) => p.trim());
  }
  if (typeof proof === "object") return [];
  if (typeof proof !== "string") return [];

  const trimmed = proof.trim();
  if (!trimmed) return [];

  const asPgArray = parsePostgresTextArray(trimmed);
  if (asPgArray) return asPgArray;

  if (trimmed.startsWith("[") || trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(isProofPath).map((p) => p.trim());
      }
      if (isProofPath(parsed)) return [parsed.trim()];
      return [];
    } catch {
      // fall through — treat as a single path
    }
  }

  if (!isProofPath(trimmed)) return [];
  return [trimmed];
}

/** Persist one or more storage paths as a Postgres `text[]` / Prisma `String[]`. */
export function serializeSaleProofPaths(paths: string[]): string[] {
  return paths.map((p) => p.trim()).filter(Boolean);
}

/** Display name from a storage path (`uuid-original.ext` → `original.ext`). */
export function saleProofFileName(storagePath: string): string {
  const base = storagePath.split(/[/\\]/).pop()?.trim() || storagePath;
  const dash = base.indexOf("-");
  if (dash > 0 && dash < base.length - 1) {
    return base.slice(dash + 1);
  }
  return base;
}

/** Authenticated view URL for a proof file on a sale (by path index). */
export function saleProofViewUrl(saleId: string, index: number): string {
  return `/api/sales/${encodeURIComponent(saleId)}/proof?index=${index}`;
}

/** Best-effort MIME type from a proof file name or storage path. */
export function saleProofMimeType(storagePath: string): string {
  const name = saleProofFileName(storagePath);
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
