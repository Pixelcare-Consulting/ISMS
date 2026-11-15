import { notFound } from "next/navigation";

import {
  getScInventoryOverviewAction,
  listScInventorySeriesOptionsAction,
  listScInventoryUnitsAction,
} from "@/features/service-center-ops/actions/sc-inventory.actions";
import { SC_INVENTORY_VIEW } from "@/features/service-center-ops/constants/sc-permissions";
import { InventorySeriesSummaryPanel } from "@/features/inventory/components/inventory-series-summary";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_INVENTORY_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScInventoryCenterScreen } from "@/app/(app)/service-centers/inventory/_components/sc-inventory-center-screen";
import { ScInventoryHomeScreen } from "@/app/(app)/service-centers/inventory/_components/sc-inventory-home-screen";
import { requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center inventory",
  "Serialized stock at service center locations.",
);

interface PageProps {
  searchParams: Promise<{
    center?: string;
    q?: string;
    status?: string;
    sku?: string;
    location?: string;
    series?: string;
    page?: string;
    limit?: string;
  }>;
}

function param(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export default async function ScInventoryPage({ searchParams }: PageProps) {
  await requirePermission(SC_INVENTORY_VIEW);
  const params = await searchParams;
  const centerId = param(params.center);

  const seriesOptions = await listScInventorySeriesOptionsAction();
  const requestedSeries = param(params.series);
  const seriesId = seriesOptions.some((option) => option.id === requestedSeries) ? requestedSeries : undefined;

  const data = await getScInventoryOverviewAction({ serviceCenterId: centerId, seriesId });
  const seriesSummary = <InventorySeriesSummaryPanel summary={data.overview.seriesSummary} />;

  const header = (
    <>
      <PageHeader
        title="Service center inventory"
        sticky={false}
        tutorial={SC_INVENTORY_PAGE_TUTORIAL}
        description="Stock at the service centers you cover. View only: units arrive through deliveries and leave through sales and pull-outs."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
    </>
  );

  if (!centerId) {
    return (
      <div className="space-y-6">
        {header}
        <ScInventoryHomeScreen
          overview={data.overview}
          statuses={data.statuses}
          seriesOptions={seriesOptions}
          seriesId={seriesId}
          seriesSummary={seriesSummary}
        />
      </div>
    );
  }

  // Missing, inactive or outside the user's scope: the overview returns no center.
  const center = data.centers[0];
  if (!center) notFound();

  const q = param(params.q) ?? "";
  const limit = parseTablePageSize(params.limit);
  const requestedStatus = param(params.status);
  const statusCodeId = data.statusOptions.some((option) => option.id === requestedStatus) ? requestedStatus : undefined;
  const requestedLocation = param(params.location);
  const locationId = center.locations.some((location) => location.id === requestedLocation)
    ? requestedLocation
    : undefined;
  const sku = param(params.sku);

  const result = await listScInventoryUnitsAction({
    serviceCenterId: center.id,
    page: Number(params.page) || 1,
    limit,
    statusCodeId,
    sku,
    locationId,
    seriesId,
    q,
  });

  return (
    <div className="space-y-6">
      {header}
      <ScInventoryCenterScreen
        key={`${center.id}:${statusCodeId ?? ""}:${sku ?? ""}:${locationId ?? ""}:${seriesId ?? ""}`}
        center={center}
        result={result}
        statuses={data.statuses}
        statusAmounts={data.statusAmounts}
        statusOptions={data.statusOptions}
        modelOptions={data.modelOptions}
        q={q}
        statusCodeId={statusCodeId}
        sku={sku}
        locationId={locationId}
        seriesId={seriesId}
        limit={limit}
        seriesSummary={seriesSummary}
      />
    </div>
  );
}
