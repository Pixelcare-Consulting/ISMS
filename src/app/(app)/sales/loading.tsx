import { Suspense } from "react";

import {
  SalesPageLoading,
  SalesPageLoadingFallback,
} from "@/app/(app)/sales/_components/sales-page-loading";

export default function Loading() {
  return (
    <Suspense fallback={<SalesPageLoadingFallback />}>
      <SalesPageLoading />
    </Suspense>
  );
}
