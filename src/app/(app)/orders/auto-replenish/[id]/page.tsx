import { OrderHistoryPage } from "@/app/(app)/orders/_components/order-history-page";

export default function AutoReplenishOrderHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderHistoryPage orderType="auto_replenish" params={params} />;
}