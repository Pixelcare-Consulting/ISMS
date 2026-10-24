import { redirect } from "next/navigation";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { transfersListHref } from "@/features/logistics/constants/transfers-page-tabs";

interface DeliveryTransfersPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/** Old Unit transfers list URL. Detail pages stay on this route. */
export default async function DeliveryTransfersPage({ searchParams }: DeliveryTransfersPageProps) {
  const params = await searchParams;
  redirect(transfersListHref("unit", Number(params.page) || 1, parseTablePageSize(params.limit)));
}
