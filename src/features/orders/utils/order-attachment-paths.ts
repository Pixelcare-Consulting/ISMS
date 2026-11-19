import {
  SALE_PROOF_MAX_FILES,
  serializeSaleProofPaths,
} from "@/features/sales/utils/sale-proof";
import { ORDER_ATTACHMENTS_PREFIX } from "@/lib/storage";

/** Storage prefix for files uploaded before the order row exists. */
export function orderAttachmentStoragePrefix(tenantId: string): string {
  return `${ORDER_ATTACHMENTS_PREFIX}/tenants/${tenantId}/`;
}

/** Same images and PDFs a sale proof accepts, including a missing browser MIME type. */
export function isOrderAttachmentFile(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  if (type === "application/pdf" || type.startsWith("image/")) return true;
  if (type) return false;
  return /\.(pdf|png|jpe?g|gif|webp|bmp)$/i.test(file.name);
}

export function buildPendingOrderAttachmentPath(input: {
  tenantId: string;
  fileId: string;
  fileName: string;
}): string {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${orderAttachmentStoragePrefix(input.tenantId)}${input.fileId}-${safeName}`;
}

/**
 * Paths stored on the order. Empty when the caller attached nothing.
 * Rejects a count above the sale-proof limit and paths outside this tenant's prefix.
 */
export function normalizeCreateOrderAttachments(
  tenantId: string,
  paths: string[] | undefined,
): string[] {
  const serialized = serializeSaleProofPaths(paths ?? []);
  if (serialized.length > SALE_PROOF_MAX_FILES) {
    throw new Error(`You can attach up to ${SALE_PROOF_MAX_FILES} files`);
  }
  const prefix = orderAttachmentStoragePrefix(tenantId);
  for (const path of serialized) {
    if (
      !path.startsWith(prefix) ||
      path.includes("..") ||
      path.includes("\\") ||
      path.includes("\0")
    ) {
      throw new Error("Attachment file is not valid");
    }
  }
  return serialized;
}
