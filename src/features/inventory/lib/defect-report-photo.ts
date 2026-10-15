export function defectReportPhotoUrl(storagePath: string): string {
  return `/api/inventory/defect-photos?path=${encodeURIComponent(storagePath)}`;
}
