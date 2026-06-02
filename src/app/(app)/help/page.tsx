import { PageHeader } from "@/app/(app)/_components/page-header";
import { HelpSupportPortal } from "@/app/(app)/help/_components/help-support-portal";
import { requireAuth } from "@/lib/auth/permissions";

export default async function HelpPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        description="Workflow guides, FAQs, and quick links for ISMS."
      />
      <HelpSupportPortal />
    </div>
  );
}
