import { PULLOUT_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import {
  DOCUMENT_ATTACHMENT_ACCEPT,
  DOCUMENT_ATTACHMENT_MAX_BYTES,
  DOCUMENT_ATTACHMENT_MAX_FILES,
  documentAttachmentError,
} from "@/lib/storage/document-attachment-rules";

/** Upload rules shared by the pull-out form and the server. */
export const PULLOUT_ATTACHMENT_MAX_FILES = DOCUMENT_ATTACHMENT_MAX_FILES;

export const PULLOUT_ATTACHMENT_MAX_BYTES = DOCUMENT_ATTACHMENT_MAX_BYTES;

export const PULLOUT_ATTACHMENT_ACCEPT = DOCUMENT_ATTACHMENT_ACCEPT;

/** Files can still be added once the units are sent, for example the signed slip. */
export const PULLOUT_ATTACHMENT_OPEN_CODES: readonly string[] = [
  PULLOUT_WORKFLOW_CODE.pending_tl,
  PULLOUT_WORKFLOW_CODE.for_pullout,
  PULLOUT_WORKFLOW_CODE.pending_logistics,
  PULLOUT_WORKFLOW_CODE.in_transit,
];

/** Null when the file can be attached. */
export const pulloutAttachmentError = documentAttachmentError;
