import { hasPermission } from "@/lib/auth/permissions";

/** Who can open the P-Count report (page, export and Stimulsoft preview). */
export const PCOUNT_REPORT_ACCESS = ["reports.view", "inventory.view"] as const;

/** Branch managers and master-data admins see every branch; others their AOR. */
export function isPcountReportUnrestricted(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, "branches.manage") || hasPermission(permissions, "master_data.manage");
}
