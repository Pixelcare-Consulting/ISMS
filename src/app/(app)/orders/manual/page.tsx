import { OrdersTypePage } from "@/app/(app)/orders/_components/orders-type-page";

interface PageProps {
    searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default function ManualOrdersPage({ searchParams }: PageProps) {
  return <OrdersTypePage orderType="manual" searchParams={searchParams} />;
}
