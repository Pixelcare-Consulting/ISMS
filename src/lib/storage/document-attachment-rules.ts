/**
 * Upload rules for PDF or image files attached to a document (pull-out, order).
 * Client-safe: the form checks a file before upload and the server checks it again.
 */
export const DOCUMENT_ATTACHMENT_MAX_FILES = 5;

/** Each file is one request, and a Vercel function body is limited to 4.5 MB. */
export const DOCUMENT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const DOCUMENT_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const DOCUMENT_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

export const DOCUMENT_ATTACHMENT_HINT = `Up to ${DOCUMENT_ATTACHMENT_MAX_FILES} PDF or image files, 4 MB each.`;

/** Null when the file can be attached. */
export function documentAttachmentError(input: {
  mimeType: string;
  sizeBytes: number;
  attachedCount: number;
}): string | null {
  if (input.attachedCount >= DOCUMENT_ATTACHMENT_MAX_FILES) {
    return `You can attach up to ${DOCUMENT_ATTACHMENT_MAX_FILES} files`;
  }
  if (!(DOCUMENT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return "Attach a PDF, JPG, PNG, or WebP file";
  }
  if (input.sizeBytes <= 0) return "This file is empty";
  if (input.sizeBytes > DOCUMENT_ATTACHMENT_MAX_BYTES) return "Each file can be up to 4 MB";
  return null;
}

/** Safe `Content-Disposition` for serving a stored file inline under its original name. */
export function inlineContentDisposition(fileName: string): string {
  // encodeURIComponent leaves these as-is, but RFC 5987 does not allow them unencoded.
  const encodedName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename*=UTF-8''${encodedName}`;
}
