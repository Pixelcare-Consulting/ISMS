import { createClient } from "@supabase/supabase-js";

import type { ObjectStorage, StorageDownloadResult, StorageUploadInput } from "@/lib/storage/types";

const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "proof_media";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase storage");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export const supabaseStorage: ObjectStorage = {
  async upload(input: StorageUploadInput): Promise<void> {
    const body =
      typeof input.body === "string" ? Buffer.from(input.body, "utf8") : input.body;
    const { error } = await getClient()
      .storage.from(SUPABASE_STORAGE_BUCKET)
      .upload(input.path, body, { contentType: input.contentType, upsert: true });
    if (error) {
      throw new Error(`Supabase storage upload failed for ${input.path}: ${error.message}`);
    }
  },

  async download(storagePath: string): Promise<StorageDownloadResult> {
    const { data, error } = await getClient().storage.from(SUPABASE_STORAGE_BUCKET).download(storagePath);
    if (error || !data) {
      throw new Error(`Supabase storage download failed for ${storagePath}: ${error?.message ?? "not found"}`);
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    return { buffer, contentType: data.type || undefined };
  },

  async remove(storagePath: string): Promise<void> {
    const { error } = await getClient().storage.from(SUPABASE_STORAGE_BUCKET).remove([storagePath]);
    if (error) {
      throw new Error(`Supabase storage remove failed for ${storagePath}: ${error.message}`);
    }
  },
};
