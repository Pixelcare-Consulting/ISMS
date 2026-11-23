import { redirect } from "next/navigation";

import { buildSalesPageHref } from "@/features/sales/utils/sales-page-href";

/**
 * Service center sales moved into Sales Transactions → Service Center tab. Older links
 * (notifications, bookmarks) keep their search.
 */
interface ScSalesRedirectProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default async function ScSalesRedirect({ searchParams }: ScSalesRedirectProps) {
  const params = await searchParams;
  redirect(
    buildSalesPageHref({
      tab: "service-center",
      q: params.q,
      status: params.status,
    }),
  );
}
