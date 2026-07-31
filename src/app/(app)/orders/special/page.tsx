import { OrdersTypePage } from "@/app/(app)/orders/_components/orders-type-page";

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default function SpecialOrdersPage({ searchParams }: PageProps) {
  return <OrdersTypePage orderType="special" searchParams={searchParams} />;
}
