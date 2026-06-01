import { PolicyForm } from "@/app/(app)/policies/_components/policy-form";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";

export default async function NewPolicyPage() {
  await requirePermission("policies.create");

  return (
    <div className="space-y-6">
      <PageHeader
        title="New policy"
        description="Create a draft policy document. Submit for review when ready."
      />
      <PolicyForm mode="create" />
    </div>
  );
}
