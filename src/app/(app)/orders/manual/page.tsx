import { OrdersTypePage } from "@/app/(app)/orders/_components/orders-type-page";

interface PageProps {
    searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    tl?: string;
    type?: string;
  }>;
}

export default function ManualOrdersPage({ searchParams }: PageProps) {
  return (
    <OrdersTypePage orderType="manual" combinedManualSpecial searchParams={searchParams} />
  );
}
