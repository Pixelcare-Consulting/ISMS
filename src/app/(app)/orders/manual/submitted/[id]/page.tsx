import { notFound } from "next/navigation";

import { SubmittedOrderView } from "@/app/(app)/orders/_components/submitted-order-view";
import { getSubmittedOrderSummary } from "@/features/orders/services/order-history-detail";

export default async function SubmittedOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getSubmittedOrderSummary(id);
  if (!order) notFound();
  return <SubmittedOrderView order={order} />;
}
