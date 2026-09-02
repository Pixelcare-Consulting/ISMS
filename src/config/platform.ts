/**
 * Identity of the platform operator — the provider that runs ISMS for its
 * customer tenants, as opposed to the tenants themselves.
 *
 * Lives here rather than inline in messages so that the handful of places that
 * tell a tenant "this is handled for you, not by you" stay consistent, and so a
 * white-label deployment has one string to change instead of a grep.
 * `PLATFORM_TENANT` in `prisma/seed-data.ts` is the seed-side counterpart; that
 * module is not importable from app code.
 */
export const PLATFORM_OPERATOR_NAME = "Pixelcare";

/**
 * Shown wherever a tenant hits SAP work that cannot proceed because no Service
 * Layer connection is configured or enabled for them. Credentials are managed
 * in the provider console, so the tenant's only move is to ask.
 */
export const SAP_NO_CONNECTION_MESSAGE =
  `SAP is not connected for this organization. ` +
  `Contact ${PLATFORM_OPERATOR_NAME} to set up or re-enable the Service Layer connection.`;
