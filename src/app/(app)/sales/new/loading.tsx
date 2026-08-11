/** Keeps New transaction from inheriting the Sales list tab skeleton. */
export default function Loading() {
  return (
    <div data-app-page-loading className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
      </div>
      <div className="h-96 rounded-xl border bg-muted/40" />
    </div>
  );
}
