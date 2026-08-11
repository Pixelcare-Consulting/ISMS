import { redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/permissions";

/**
 * Legacy URL — global permissions catalog lives under the Provider console.
 * Tenant users (including tenant-only super admins) are denied / sent to dashboard.
 */
export default async function SettingsPermissionsPage() {
  await requirePlatformOperator();
  redirect("/provider/permissions");
}
