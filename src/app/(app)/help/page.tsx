import { PageHeader } from "@/app/(app)/_components/page-header";
import { HelpSupportPortal } from "@/app/(app)/help/_components/help-support-portal";
import { HelpAssistPanel } from "@/features/ai/components/help-assist-panel";
import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { requireAuth } from "@/lib/auth/permissions";

export default async function HelpPage() {
  const session = await requireAuth();
  const showAssist = canUseAiAssist(session.user.permissions);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        description="Workflow guides, FAQs, and quick links for ISMS."
      />
      {showAssist ? <HelpAssistPanel configured={isAiConfigured()} /> : null}
      <HelpSupportPortal />
    </div>
  );
}
