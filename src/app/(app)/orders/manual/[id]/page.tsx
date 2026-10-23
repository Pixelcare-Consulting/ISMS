import { OrderHistoryPage } from "@/app/(app)/orders/_components/order-history-page";

export default function ManualOrderHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderHistoryPage orderType="manual" params={params} />;
}
