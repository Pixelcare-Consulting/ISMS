export default function AppLoading() {
  return (
    <div data-app-page-loading className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
      </div>
      <div className="h-64 rounded-xl border bg-muted/40" />
    </div>
  );
}
