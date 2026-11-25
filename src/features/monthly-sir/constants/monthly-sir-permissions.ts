/** Menu permission. Opening Monthly SIR stays on View. */
export const MONTHLY_SIR_VIEW_SLUG = "inventory.monthly_sir.view";

export const MONTHLY_SIR_DOWNLOAD_TEMPLATE_SLUG =
  "inventory.monthly_sir.download_template";
export const MONTHLY_SIR_SCAN_SERIALS_SLUG = "inventory.monthly_sir.scan_serials";
/** Upload P-COUNT and Request to upload when no free slot is open. */
export const MONTHLY_SIR_UPLOAD_SLUG = "inventory.monthly_sir.upload";
export const MONTHLY_SIR_GENERATE_VARIANCE_SLUG =
  "inventory.monthly_sir.generate_variance";
export const MONTHLY_SIR_OPEN_PCOUNT_SLUG = "inventory.monthly_sir.open_pcount";
/** Approve or reject a request that is waiting on For approval. */
export const MONTHLY_SIR_APPROVE_SLUG = "inventory.monthly_sir.approve";

/** Branch inventory Manage. Approve is granted only together with Monthly SIR View. */
export const INVENTORY_MANAGE_SLUG = "inventory.manage";

export const MONTHLY_SIR_PERMISSION_CATALOG = [
  { slug: MONTHLY_SIR_VIEW_SLUG, name: "View Monthly SIR" },
  {
    slug: MONTHLY_SIR_DOWNLOAD_TEMPLATE_SLUG,
    name: "Download Monthly SIR template",
  },
  { slug: MONTHLY_SIR_SCAN_SERIALS_SLUG, name: "Scan Monthly SIR serials" },
  { slug: MONTHLY_SIR_UPLOAD_SLUG, name: "Upload Monthly SIR P-COUNT" },
  {
    slug: MONTHLY_SIR_GENERATE_VARIANCE_SLUG,
    name: "Generate Monthly SIR variance",
  },
  { slug: MONTHLY_SIR_OPEN_PCOUNT_SLUG, name: "Open Monthly SIR P-Count" },
  { slug: MONTHLY_SIR_APPROVE_SLUG, name: "Approve Monthly SIR" },
] as const;

/**
 * Buttons a person with View can already use.
 * Approve stays off this list.
 */
export const MONTHLY_SIR_USE_SLUGS = [
  MONTHLY_SIR_DOWNLOAD_TEMPLATE_SLUG,
  MONTHLY_SIR_SCAN_SERIALS_SLUG,
  MONTHLY_SIR_UPLOAD_SLUG,
  MONTHLY_SIR_GENERATE_VARIANCE_SLUG,
  MONTHLY_SIR_OPEN_PCOUNT_SLUG,
] as const;

export const MONTHLY_SIR_ACTION_CAPABILITIES = {
  canDownloadTemplate: MONTHLY_SIR_DOWNLOAD_TEMPLATE_SLUG,
  canScanSerials: MONTHLY_SIR_SCAN_SERIALS_SLUG,
  canUpload: MONTHLY_SIR_UPLOAD_SLUG,
  canGenerateVariance: MONTHLY_SIR_GENERATE_VARIANCE_SLUG,
  canOpenPcount: MONTHLY_SIR_OPEN_PCOUNT_SLUG,
  canApprove: MONTHLY_SIR_APPROVE_SLUG,
} as const;

export type MonthlySirCapabilities = {
  canDownloadTemplate: boolean;
  canScanSerials: boolean;
  canUpload: boolean;
  canGenerateVariance: boolean;
  canOpenPcount: boolean;
  canApprove: boolean;
};

function hasSlug(permissions: string[] | undefined, slug: string): boolean {
  return permissions?.includes(slug) ?? false;
}

/** Each flag is one checkbox. View is not a button. */
export function resolveMonthlySirCapabilities(
  permissions: string[] | undefined,
): MonthlySirCapabilities {
  return {
    canDownloadTemplate: hasSlug(permissions, MONTHLY_SIR_ACTION_CAPABILITIES.canDownloadTemplate),
    canScanSerials: hasSlug(permissions, MONTHLY_SIR_ACTION_CAPABILITIES.canScanSerials),
    canUpload: hasSlug(permissions, MONTHLY_SIR_ACTION_CAPABILITIES.canUpload),
    canGenerateVariance: hasSlug(permissions, MONTHLY_SIR_ACTION_CAPABILITIES.canGenerateVariance),
    canOpenPcount: hasSlug(permissions, MONTHLY_SIR_ACTION_CAPABILITIES.canOpenPcount),
    canApprove: hasSlug(permissions, MONTHLY_SIR_ACTION_CAPABILITIES.canApprove),
  };
}
