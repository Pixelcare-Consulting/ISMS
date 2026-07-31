import Link from "next/link";
import { Plus } from "lucide-react";

import { listSalesAction } from "@/features/sales/actions/sales.actions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";
import { Button } from "@/components/ui/button";

interface SalesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  await requirePermission("sales.create");
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
          <Button asChild>
            <Link href="/sales/new">
              <Plus className="size-4" />
              New transaction
            </Link>
          </Button>
        }
      />
      <SalesTable result={result} />
    </div>
  );
}
