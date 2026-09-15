/**
 * Branch-level kill switch for the whole app.
 *
 * While `true`, `src/proxy.ts` rewrites every page to `/maintenance` and
 * answers API routes with 503, so nobody (signed in or not) can reach the app.
 * Flip to `false` to reopen access. Setting the `MAINTENANCE_MODE` env var to
 * `"true"` / `"false"` overrides this constant without a code change.
 */
const MAINTENANCE_MODE_DEFAULT = true;

function resolveMaintenanceMode(): boolean {
  const raw = (process.env.MAINTENANCE_MODE ?? "").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return MAINTENANCE_MODE_DEFAULT;
}

export const MAINTENANCE_MODE = resolveMaintenanceMode();

export const MAINTENANCE_PATH = "/maintenance";
