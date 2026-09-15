/**
 * Kill switch for the whole app, driven by the `MAINTENANCE_MODE` env var.
 *
 * When set to `"true"`, `src/proxy.ts` rewrites every page to `/maintenance`
 * and answers API routes with 503, so nobody (signed in or not) can reach the
 * app. Anything else (unset, empty, `"false"`) keeps the app open.
 *
 * The proxy reads this at build time, so on Vercel: set the variable for the
 * target environment, then redeploy.
 */
export const MAINTENANCE_MODE =
  (process.env.MAINTENANCE_MODE ?? "").trim().toLowerCase() === "true";

export const MAINTENANCE_PATH = "/maintenance";
