import { ORDER_WORKFLOW_DESCRIPTION } from "@/features/orders/constants/order-workflow";
import { listOrdersAction } from "@/features/orders/actions/order.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";

interface OrdersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requirePermission("orders.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const result = await listOrdersAction({ page });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch orders"
        description={ORDER_WORKFLOW_DESCRIPTION}
      />
      <OrdersTable result={result} />
    </div>
  );
}
