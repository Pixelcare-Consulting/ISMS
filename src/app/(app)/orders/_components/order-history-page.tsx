import { notFound } from "next/navigation";
import type { BranchOrderType } from "@prisma/client";

import { OrderHistoryDetailView } from "@/app/(app)/orders/_components/order-history-detail";
import { getOrderHistoryDetail } from "@/features/orders/services/order-history-detail";

export async function OrderHistoryPage({
  orderType,
  params,
}: {
  orderType: BranchOrderType;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderHistoryDetail(orderType, id);
  if (!order) notFound();
  return <OrderHistoryDetailView order={order} />;
}
