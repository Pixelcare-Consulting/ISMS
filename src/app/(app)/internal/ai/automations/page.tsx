import { AutomationsPanel } from "@/features/pixelcare-ai/components/automations-panel";
import { PixelcareAiAccessDenied } from "@/features/pixelcare-ai/components/access-denied";
import {
  isMissingAutomationStorage,
  loadAutomationWorkspace,
} from "@/features/pixelcare-ai/automations/automation.service";
import type { AutomationWorkspace } from "@/features/pixelcare-ai/automations/view-model";
import { resolvePixelcareAiPageAccess } from "@/features/pixelcare-ai/lib/access";
import { BackToIsms } from "@/features/pixelcare-ai/components/back-to-isms";

export const dynamic = "force-dynamic";

export default async function PixelcareAutomationsPage() {
  const access = await resolvePixelcareAiPageAccess();
  if (!access.ok) {
    return <PixelcareAiAccessDenied reason={access.reason} />;
  }

  let workspace: AutomationWorkspace | null = null;
  let storageMissing = false;
  try {
    workspace = await loadAutomationWorkspace(access.session);
  } catch (error) {
    if (!isMissingAutomationStorage(error)) throw error;
    storageMissing = true;
  }

  if (storageMissing || !workspace) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <h1 className="text-lg font-semibold">Automations</h1>
          <BackToIsms />
        </header>
        <p className="max-w-xl px-4 py-6 text-sm text-muted-foreground">
          Automations are not available until the database update for this release is applied.
          Scheduled runs, proposals, and reminders cannot be saved yet.
        </p>
      </div>
    );
  }

  return <AutomationsPanel workspace={workspace} />;
}
