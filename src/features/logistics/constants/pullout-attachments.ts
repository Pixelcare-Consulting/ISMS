import { PULLOUT_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";

/** Upload rules shared by the pull-out form and the server. */
export const PULLOUT_ATTACHMENT_MAX_FILES = 5;

/** Each file is one request, and a Vercel function body is limited to 4.5 MB. */
export const PULLOUT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const PULLOUT_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PULLOUT_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

/** Files can still be added once the units are sent, for example the signed slip. */
export const PULLOUT_ATTACHMENT_OPEN_CODES: readonly string[] = [
  PULLOUT_WORKFLOW_CODE.pending_tl,
  PULLOUT_WORKFLOW_CODE.for_pullout,
  PULLOUT_WORKFLOW_CODE.pending_logistics,
  PULLOUT_WORKFLOW_CODE.in_transit,
];

/** Null when the file can be attached. */
export function pulloutAttachmentError(input: {
  mimeType: string;
  sizeBytes: number;
  attachedCount: number;
}): string | null {
  if (input.attachedCount >= PULLOUT_ATTACHMENT_MAX_FILES) {
    return `You can attach up to ${PULLOUT_ATTACHMENT_MAX_FILES} files`;
  }
  if (!(PULLOUT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return "Attach a PDF, JPG, PNG, or WebP file";
  }
  if (input.sizeBytes <= 0) return "This file is empty";
  if (input.sizeBytes > PULLOUT_ATTACHMENT_MAX_BYTES) return "Each file can be up to 4 MB";
  return null;
}
