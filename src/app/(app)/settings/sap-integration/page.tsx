import { listSapJobsAction } from "@/features/sap/actions/sap.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { SapIntegrationPanel } from "@/app/(app)/settings/sap-integration/_components/sap-integration-panel";

interface SapIntegrationPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SapIntegrationPage({ searchParams }: SapIntegrationPageProps) {
  await requirePermission("logistics.manage");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const jobs = await listSapJobsAction({ page });

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Outbound jobs with idempotency keys and mock order→SAP→delivery processor.
      </SectionPageLead>
      <SapIntegrationPanel jobs={jobs} />
    </div>
  );
}
