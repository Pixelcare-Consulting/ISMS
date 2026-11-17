/** Keeps New transaction from inheriting the Sales list tab skeleton. */
export default function Loading() {
  return (
    <div data-app-page-loading className="space-y-6 animate-pulse">
      <div className="h-24 rounded-xl bg-muted" />
      <div className="h-96 rounded-xl border border-border/70 bg-muted/40" />
    </div>
  );
}
