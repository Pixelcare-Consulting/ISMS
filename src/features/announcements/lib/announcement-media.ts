export const ANNOUNCEMENT_MEDIA_PREFIX = "announcement-media";

export function buildAnnouncementMediaPath(input: {
  tenantId: string;
  fileId: string;
  fileName: string;
}) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ANNOUNCEMENT_MEDIA_PREFIX}/tenants/${input.tenantId}/${input.fileId}-${safeName}`;
}

/** Public app URL that serves a stored announcement image (auth required). */
export function announcementMediaPublicUrl(storagePath: string): string {
  return `/api/announcements/media?path=${encodeURIComponent(storagePath)}`;
}
