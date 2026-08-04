import { OrdersTypePage } from "@/app/(app)/orders/_components/orders-type-page";

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string; sort?: string; dir?: string }>;
}

export default function AutoReplenishOrdersPage({ searchParams }: PageProps) {
  return <OrdersTypePage orderType="auto_replenish" searchParams={searchParams} />;
}
