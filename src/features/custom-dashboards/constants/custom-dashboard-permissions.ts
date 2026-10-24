// Pure constants (no server imports) so client navigation can use them too.
export const CUSTOM_DASHBOARD_VIEW = "dashboard.custom.view";
export const CUSTOM_DASHBOARD_MANAGE = "dashboard.custom.manage";

/** Either permission opens the Custom Dashboards list. */
export const CUSTOM_DASHBOARD_ACCESS = [CUSTOM_DASHBOARD_VIEW, CUSTOM_DASHBOARD_MANAGE];

export function canManageCustomDashboards(permissions: string[] | undefined): boolean {
  return permissions?.includes(CUSTOM_DASHBOARD_MANAGE) ?? false;
}
