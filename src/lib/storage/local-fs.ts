import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ObjectStorage, StorageDownloadResult, StorageUploadInput } from "@/lib/storage/types";

/**
 * Resolves the local storage root for Docker/Ubuntu staging and local dev.
 *
 * - Default (no env): statically scoped `path.join(process.cwd(), ".data", "uploads")`
 *   so Turbopack FS tracing never sees a dynamic segment under cwd.
 * - Docker: set absolute `STORAGE_ROOT` (e.g. `/app/data/uploads`). Absolute values
 *   are returned as-is — no `path.join(cwd, …)`.
 * - Relative `STORAGE_ROOT` is rejected (would require `path.join(cwd, dynamicVar)`).
 */
function getStorageRoot(): string {
  const configured = process.env.STORAGE_ROOT?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error(
        `STORAGE_ROOT must be an absolute path (got relative: ${configured}). ` +
          `For Docker use e.g. STORAGE_ROOT=/app/data/uploads; for local omit it to use .data/uploads.`,
      );
    }
    return configured;
  }
  return path.join(process.cwd(), ".data", "uploads");
}

function resolveSafePath(storagePath: string): string {
  const root = getStorageRoot();
  const normalized = storagePath.replace(/^[/\\]+/, "").replace(/\0/g, "");
  // Runtime-only paths (STORAGE_ROOT or cwd/.data/uploads) — do not NFT-trace.
  const full = path.resolve(/* turbopackIgnore: true */ root, normalized);
  const rootResolved = path.resolve(/* turbopackIgnore: true */ root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return full;
}

export const localFsStorage: ObjectStorage = {
  async upload(input: StorageUploadInput): Promise<void> {
    const fullPath = resolveSafePath(input.path);
    const dir = path.dirname(fullPath);
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
    const body =
      typeof input.body === "string" ? Buffer.from(input.body, "utf8") : input.body;
    await writeFile(/* turbopackIgnore: true */ fullPath, body);
  },

  async download(storagePath: string): Promise<StorageDownloadResult> {
    const fullPath = resolveSafePath(storagePath);
    const buffer = await readFile(/* turbopackIgnore: true */ fullPath);
    return { buffer };
  },

  async remove(storagePath: string): Promise<void> {
    const fullPath = resolveSafePath(storagePath);
    try {
      await unlink(/* turbopackIgnore: true */ fullPath);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code !== "ENOENT") {
        throw error;
      }
    }
  },
};

export function getLocalStorageRoot(): string {
  return getStorageRoot();
}
