/** Public self-serve tenant registration (local/demo only). Off unless explicitly enabled. */
export function isPublicRegisterEnabled() {
  return process.env.ALLOW_PUBLIC_REGISTER === "true";
}
