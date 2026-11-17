import { PLATFORM_OPERATOR_NAME } from "@/config/platform";
import { getSapConnectionStateAction } from "@/features/sap/actions/sap.actions";
import { cn } from "@/utils/cn";

type SapConnectionState = "no_config" | "idle" | "connected";

/**
 * Full-width connection note for the SAP integration page.
 *
 * Tenants can see whether SAP is reachable. They do not connect or disconnect
 * it — Pixelcare keeps that. Refreshes with the page, including after Send.
 */
export async function SapConnectionBadge() {
  const state = await getSapConnectionStateAction();
  const note = connectionNote(state.state);

  return (
    <p role="status" className={cn("rounded-lg border px-4 py-3 text-sm", note.className)}>
      {note.text}
    </p>
  );
}

function connectionNote(state: SapConnectionState): { text: string; className: string } {
  switch (state) {
    case "connected":
      return {
        text: "SAP is connected right now.",
        className:
          "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      };
    case "idle":
      return {
        text: "SAP is ready. A connection opens when a document is sent.",
        className: "bg-muted/40 text-foreground",
      };
    case "no_config":
      return {
        text: `SAP is not set up yet. ${PLATFORM_OPERATOR_NAME} sets this up.`,
        className: "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
