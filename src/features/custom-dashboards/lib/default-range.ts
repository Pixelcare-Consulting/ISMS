/** Default data window for custom dashboards: the last 30 days, inclusive. */
export function defaultDashboardRange(today = new Date()): { from: string; to: string } {
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  return { from: fromDate.toISOString().slice(0, 10), to };
}
