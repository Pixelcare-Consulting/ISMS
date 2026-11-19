import { redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScServiceReturnsPanel } from "@/app/(app)/service-centers/returns/_components/sc-service-returns-panel";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_RETURNS_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { listScServiceReturnsAction } from "@/features/service-center-ops/actions/sc-service-returns.actions";
import { canProcessScServiceReturns } from "@/features/service-center-ops/constants/sc-permissions";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center returns",
  "Finish the Service Returns and Replacements sent to your service centers.",
);

interface PageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    limit?: string;
    request?: string;
  }>;
}

export default async function ScServiceReturnsPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  if (!canProcessScServiceReturns(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const result = await listScServiceReturnsAction({
    page: Number(params.page) || 1,
    limit: Number(params.limit) || undefined,
    q: params.q,
    status: params.status,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center returns"
        sticky={false}
        tutorial={SC_RETURNS_PAGE_TUTORIAL}
        description="Service Returns and Replacements a CSR requested on your service center's sales. Submit the return, replace it from your stock, raise a special order, or reject it."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <ScServiceReturnsPanel
        result={result}
        initialQuery={params.q ?? ""}
        initialRequestId={params.request ?? null}
      />
    </div>
  );
}
