import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { listSalesAction } from "@/features/sales/actions/sales.actions";
import {
  canAccessSales,
  resolveSalesCapabilities,
} from "@/features/sales/constants/sales-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata(
  "Sales & ATR",
  "Branch sales with multi-line encode, reserved (RSV) flow, and ATR return workflow.",
);

interface SalesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireAuth();
  if (!canAccessSales(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const capabilities = resolveSalesCapabilities(session.user.permissions);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const result = await listSalesAction({ page, limit });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & ATR"
        sticky={false}
        tutorial={SALES_PAGE_TUTORIAL}
        description="Branch sales with multi-line encode, reserved (RSV) flow, and ATR return workflow."
        actions={
          capabilities.canCreateSale ? (
            <Button asChild>
              <Link href="/sales/new">
                <Plus className="size-4" />
                New transaction
              </Link>
            </Button>
          ) : null
        }
      />
      <SalesTable result={result} capabilities={capabilities} />
    </div>
  );
}
