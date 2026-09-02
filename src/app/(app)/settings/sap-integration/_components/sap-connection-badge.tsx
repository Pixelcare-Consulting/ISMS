import { Badge } from "@/components/ui/badge";
import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { getSapConnectionStateAction } from "@/features/sap/actions/sap.actions";

/**
 * Read-only connection indicator for the tenant queue page.
 *
 * Answers "is SAP reachable right now?" while troubleshooting a stalled queue,
 * without exposing the connection details or offering a connect/disconnect
 * control — those are platform-operator concerns. Rendered on the server so it
 * costs no client polling; it refreshes whenever the page does, which is on
 * every queue action.
 */
export async function SapConnectionBadge() {
  const state = await getSapConnectionStateAction();

  if (state.state === "connected") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        <span
          aria-hidden
          className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500"
        />
        SAP connected
      </Badge>
    );
  }

  if (state.state === "idle") {
    return (
      <Badge variant="secondary" title="Credentials are configured; no session is open right now.">
        <span
          aria-hidden
          className="mr-1.5 inline-block size-1.5 rounded-full bg-muted-foreground/60"
        />
        SAP idle
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      title={SAP_NO_CONNECTION_MESSAGE}
    >
      <span
        aria-hidden
        className="mr-1.5 inline-block size-1.5 rounded-full bg-amber-500"
      />
      SAP not configured
    </Badge>
  );
}
