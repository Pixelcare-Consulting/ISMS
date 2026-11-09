import { hasPermission } from "@/lib/auth/permissions";

/** Managers and branch admins read every branch; everyone else is AOR-scoped. */
export function hasCompetitorFullAccess(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, "competitors.manage") ||
    hasPermission(permissions, "branches.manage")
  );
}
