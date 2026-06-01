import { listOrdersAction } from "@/features/orders/actions/order.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";

export default async function OrdersPage() {
  await requirePermission("orders.view");
  const orders = await listOrdersAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch orders"
        description="Manual, auto-replenish, and special orders with PS → TL → SP → Logistics approval."
      />
      <OrdersTable orders={orders} />
    </div>
  );
}
