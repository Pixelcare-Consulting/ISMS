import { OrderHistoryPage } from "@/app/(app)/orders/_components/order-history-page";

export default function SpecialOrderHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderHistoryPage orderType="special" params={params} />;
}
