import Link from "next/link";
import { Plus } from "lucide-react";

import { listPoliciesAction } from "@/features/policies/actions/policy.actions";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/features/policies/constants/policy-status";
import {
  canManagePolicies,
  hasPermission,
  requirePolicyAccess,
} from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PoliciesTable } from "@/app/(app)/policies/_components/policies-table";
import { Button } from "@/components/ui/button";

export default async function PoliciesPage() {
  const session = await requirePolicyAccess();
  const permissions = session.user.permissions ?? [];
  const canCreate = hasPermission(permissions, "policies.create");
  const canApprove = hasPermission(permissions, "policies.approve");
  const canManage = canManagePolicies(permissions);
  const viewOnly = !canManage;

  const policies = await listPoliciesAction();

  const rows = policies.map((policy) => ({
    id: policy.id,
    title: policy.title,
    description: policy.description,
    status: policy.status as PolicyStatus,
    statusLabel:
      POLICY_STATUS_LABELS[policy.status as PolicyStatus] ?? policy.status,
    updatedAt: policy.updatedAt,
    createdByName: policy.createdBy.name ?? policy.createdBy.email,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description={
          viewOnly
            ? "Approved ISMS policy documents (read-only)."
            : "Document control — draft, review, approve, revisions, attachments, and PDF export."
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/policies/new">
                <Plus className="size-4" />
                New policy
              </Link>
            </Button>
          ) : null
        }
      />
      <PoliciesTable
        policies={rows}
        viewOnly={viewOnly}
        canCreate={canCreate}
        canApprove={canApprove}
      />
    </div>
  );
}
