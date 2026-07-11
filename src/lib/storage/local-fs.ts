import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ObjectStorage, StorageDownloadResult, StorageUploadInput } from "@/lib/storage/types";

function getStorageRoot(): string {
  const root = process.env.STORAGE_ROOT?.trim() || ".data/uploads";
  return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
}

function resolveSafePath(storagePath: string): string {
  const root = getStorageRoot();
  const normalized = storagePath.replace(/^[/\\]+/, "").replace(/\0/g, "");
  const full = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return full;
}

export const localFsStorage: ObjectStorage = {
  async upload(input: StorageUploadInput): Promise<void> {
    const fullPath = resolveSafePath(input.path);
    await mkdir(path.dirname(fullPath), { recursive: true });
    const body =
      typeof input.body === "string" ? Buffer.from(input.body, "utf8") : input.body;
    await writeFile(fullPath, body);
  },

  async download(storagePath: string): Promise<StorageDownloadResult> {
    const fullPath = resolveSafePath(storagePath);
    const buffer = await readFile(fullPath);
    return { buffer };
  },

  async remove(storagePath: string): Promise<void> {
    const fullPath = resolveSafePath(storagePath);
    try {
      await unlink(fullPath);
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
