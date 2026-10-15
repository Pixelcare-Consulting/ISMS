"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpToLine,
  Box,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  MapPin,
  Package,
  RotateCcw,
  Search,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type {
  SerialEventType,
  SerialTimelineEvent,
  SerialTraceability,
} from "@/features/serial-numbers/services/serial-number.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  TablePageSizeSelect,
  TablePagination,
  useClientTablePagination,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { cn } from "@/utils/cn";

type RelatedUnit = SerialTraceability["relatedUnits"]["sameSku"]["units"][number];

const RELATED_STATUS_ALL = "__all__";
const RELATED_MODAL_PAGE_SIZE = 10;
const PRODUCT_CARD_EXPANDED_KEY = "inventory.serialDetail.productExpanded";
const LOCATION_CARD_EXPANDED_KEY = "inventory.serialDetail.locationExpanded";

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
});

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const EVENT_META: Record<SerialEventType, { icon: LucideIcon; tint: string }> = {
  inventory: { icon: Package, tint: "bg-sky-100 text-sky-700" },
  sale: { icon: Store, tint: "bg-emerald-100 text-emerald-700" },
  return: { icon: RotateCcw, tint: "bg-rose-100 text-rose-700" },
  transfer: { icon: ArrowLeftRight, tint: "bg-violet-100 text-violet-700" },
  pullout: { icon: ArrowUpToLine, tint: "bg-amber-100 text-amber-700" },
  count: { icon: ClipboardList, tint: "bg-slate-100 text-slate-700" },
  delivery: { icon: Truck, tint: "bg-teal-100 text-teal-700" },
  backload: { icon: Truck, tint: "bg-orange-100 text-orange-700" },
};

export interface RelatedInventoryStatusOption {
  id: string;
  code: string;
  name: string;
}

interface SerialDetailViewProps {
  serial: SerialTraceability;
  /** Inventory system status masterdata for the Related products filter. */
  inventoryStatusOptions: RelatedInventoryStatusOption[];
}

export function SerialDetailView({
  serial,
  inventoryStatusOptions,
}: SerialDetailViewProps) {
  return (
    <div className="space-y-6">
      <DetailHeader serial={serial} />
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <DetailsCard
          serial={serial}
          inventoryStatusOptions={inventoryStatusOptions}
        />
        <LocationCard serial={serial} />
      </div>
      <TimelineCard events={serial.events} />
    </div>
  );
}

function locationLabel(serial: SerialTraceability): string {
  return (
    serial.current?.branch ??
    serial.current?.warehouseName ??
    serial.sap.whsName ??
    serial.sap.whsCode ??
    "—"
  );
}

function agingLabel(serial: SerialTraceability): string {
  if (serial.deliveryReceipt.agingDays == null) return "—";
  const days = serial.deliveryReceipt.agingDays;
  return `${days} day${days === 1 ? "" : "s"}`;
}

function brandSeriesLine(serial: SerialTraceability): string {
  return (
    [serial.model.brand, serial.model.series].filter(Boolean).join(" · ") ||
    "No brand"
  );
}

function buildLocationQuery(serial: SerialTraceability): string | null {
  const parts = [
    serial.current?.branch,
    serial.current?.province,
    serial.current?.region,
    "Philippines",
  ].filter((part): part is string => Boolean(part && part.trim()));

  if (!serial.current?.branch) return null;
  return parts.join(", ");
}

function googleMapsEmbedSrc(query: string): string {
  const params = new URLSearchParams({
    q: query,
    z: "15",
    output: "embed",
  });
  return `https://maps.google.com/maps?${params.toString()}`;
}

function googleMapsOpenUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function BranchLocationMap({
  query,
  title,
  subtitle,
  className,
}: {
  query: string;
  title: string;
  subtitle?: string | null;
  className?: string;
}) {
  const embedSrc = googleMapsEmbedSrc(query);
  const openUrl = googleMapsOpenUrl(query);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-muted/30",
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-full bg-muted sm:aspect-[2/1]">
        <iframe
          title={`Map of ${title}`}
          src={embedSrc}
          className="absolute inset-0 size-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <div className="flex items-start justify-between gap-3 border-t px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle ? (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">{query}</p>
          )}
        </div>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Open in Maps
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function CollapsibleCardHeader({
  title,
  expanded,
  onToggle,
  controlsId,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  function onHeaderKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  }

  return (
    <CardHeader
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer pb-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        expanded && "border-b",
      )}
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      onKeyDown={onHeaderKeyDown}
    >
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <span
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground"
          aria-hidden
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="size-4" />
              Show
            </>
          )}
        </span>
      </div>
    </CardHeader>
  );
}

function DetailHeader({ serial }: { serial: SerialTraceability }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 space-y-3 border-b border-border/60 bg-background px-4 py-2.5 shadow-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-mono text-[1.35rem] font-bold tracking-tight text-foreground sm:text-2xl">
            {serial.serialNo}
          </h1>
          <p className="text-sm font-medium leading-snug">
            <span className="font-mono">{serial.model.skuCode}</span>
            <span className="text-muted-foreground"> — </span>
            {serial.model.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {brandSeriesLine(serial)}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="w-fit shrink-0 self-end">
          <Link href="/inventory/serial-numbers">
            <ArrowLeft className="size-4" /> All serials
          </Link>
        </Button>
      </div>

      <dl className="grid gap-3 border-t border-border/50 pt-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeaderField
          label="Current location"
          value={
            <span className="inline-flex items-center gap-1 font-medium">
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              {locationLabel(serial)}
            </span>
          }
        />
        <HeaderField
          label="Branch SAP code"
          value={serial.current?.branchSapCode ?? "—"}
          mono
        />
        <HeaderField
          label="DR#"
          value={
            serial.deliveryReceipt.deliveryNo ? (
              <Link
                href={`/logistics/deliveries?q=${encodeURIComponent(serial.deliveryReceipt.deliveryNo)}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {serial.deliveryReceipt.deliveryNo}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <HeaderField label="Aging" value={agingLabel(serial)} />
      </dl>
    </div>
  );
}

function HeaderField({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("text-sm", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function DetailsCard({
  serial,
  inventoryStatusOptions,
}: {
  serial: SerialTraceability;
  inventoryStatusOptions: RelatedInventoryStatusOption[];
}) {
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [expanded, setExpanded] = usePersistedBoolean(
    PRODUCT_CARD_EXPANDED_KEY,
    true,
  );
  const bodyId = "serial-detail-product-body";

  return (
    <Card className="flex h-full flex-col">
      <CollapsibleCardHeader
        title="Product & record"
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        controlsId={bodyId}
      />
      {expanded ? (
        <CardContent id={bodyId} className="flex flex-1 flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <DetailRow label="SKU" value={serial.model.skuCode} mono />
            <DetailRow
              label="Record status"
              value={
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  <Badge
                    variant={
                      serial.recordStatus === "active" ? "default" : "secondary"
                    }
                  >
                    {serial.recordStatus === "active" ? "Active" : "Inactive"}
                  </Badge>
                  {serial.current?.status ? (
                    <StatusCodeBadge
                      code={serial.current.status.code}
                      name={serial.current.status.name}
                      color={serial.current.status.color}
                    />
                  ) : null}
                </span>
              }
            />
            <DetailRow label="Brand" value={serial.model.brand ?? "—"} />
            <DetailRow label="Series" value={serial.model.series ?? "—"} />
            <DetailRow
              label="SRP"
              value={
                serial.model.srp != null
                  ? currencyFormatter.format(serial.model.srp)
                  : "—"
              }
            />
            <DetailRow label="Size" value={serial.model.size ?? "—"} />
            <DetailRow
              label="Resolution"
              value={serial.model.resolution ?? "—"}
            />
            <DetailRow label="Feature" value={serial.model.feature ?? "—"} />
            <DetailRow
              label="Updated"
              value={dateTimeFormatter.format(serial.updatedAt)}
            />
            {serial.model.description ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </dt>
                <dd className="mt-1 line-clamp-3 text-sm leading-relaxed">
                  {serial.model.description}
                </dd>
              </div>
            ) : null}
          </dl>

          <RelatedUnitsPreview
            serial={serial}
            className="mt-auto"
            onViewAll={() => setRelatedOpen(true)}
          />
        </CardContent>
      ) : null}

      <RelatedProductsDialog
        serial={serial}
        inventoryStatusOptions={inventoryStatusOptions}
        open={relatedOpen}
        onOpenChange={setRelatedOpen}
      />
    </Card>
  );
}

function RelatedUnitsTable({
  units,
  showBranch,
  compact = false,
  emptyMessage = "No other units of this SKU found.",
}: {
  units: RelatedUnit[];
  showBranch: boolean;
  compact?: boolean;
  emptyMessage?: string;
}) {
  const cellPad = compact ? "px-3 py-2" : "px-3 py-2.5";

  if (units.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <Table scrollContainer={false}>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className={cn(cellPad, "h-9")}>Serial</TableHead>
            {showBranch ? (
              <TableHead className={cn(cellPad, "h-9")}>Branch</TableHead>
            ) : null}
            <TableHead className={cn(cellPad, "h-9")}>Status</TableHead>
            <TableHead className={cn(cellPad, "h-9 w-14 text-right")}>
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => (
            <TableRow key={unit.id}>
              <TableCell className={cn(cellPad, "font-mono text-sm font-medium")}>
                <Link
                  href={`/inventory/serial-numbers/${unit.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {unit.serialNo}
                </Link>
              </TableCell>
              {showBranch ? (
                <TableCell className={cn(cellPad, "text-sm text-muted-foreground")}>
                  {unit.branchName ?? unit.branchSapCode ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className={cellPad}>
                {unit.status ? (
                  <StatusCodeBadge
                    code={unit.status.code}
                    name={unit.status.name}
                    color={unit.status.color}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className={cn(cellPad, "text-right")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  asChild
                >
                  <Link
                    href={`/inventory/serial-numbers/${unit.id}`}
                    aria-label={`Open serial ${unit.serialNo}`}
                  >
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RelatedProductsDialog({
  serial,
  inventoryStatusOptions,
  open,
  onOpenChange,
}: {
  serial: SerialTraceability;
  inventoryStatusOptions: RelatedInventoryStatusOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { sameSku } = serial.relatedUnits;
  const branchLabel = serial.current?.branch ?? null;
  const showBranch = sameSku.scope === "elsewhere";
  const units = sameSku.units;
  const title =
    sameSku.scope === "branch" && branchLabel
      ? `Same SKU at ${branchLabel}`
      : "Other units of this SKU";

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(RELATED_STATUS_ALL);

  const filteredUnits = useMemo(() => {
    const term = query.trim().toLowerCase();
    return units.filter((unit) => {
      if (statusFilter !== RELATED_STATUS_ALL) {
        if (unit.status?.code !== statusFilter) return false;
      }
      if (!term) return true;
      const haystack = [
        unit.serialNo,
        unit.status?.name,
        unit.status?.code,
        unit.branchName,
        unit.branchSapCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [units, query, statusFilter]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
  } = useClientTablePagination(filteredUnits, {
    pageSize: RELATED_MODAL_PAGE_SIZE,
    resetKey: `${query}:${statusFilter}:${open ? "open" : "closed"}`,
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setStatusFilter(RELATED_STATUS_ALL);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90svh] w-[min(calc(100vw-2rem),42rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>Related products</DialogTitle>
          <DialogDescription className="sr-only">
            Browse other serial numbers of the same SKU.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-6">
          <p className="shrink-0 text-sm font-medium">{title}</p>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <TablePageSizeSelect value={pageSize} onChange={setPageSize} />
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search serial…"
                className="h-9 pl-8"
                aria-label="Search related serials"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                size="sm"
                className="w-full sm:w-[11.5rem]"
                aria-label="Filter by inventory status"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={RELATED_STATUS_ALL}>All statuses</SelectItem>
                {inventoryStatusOptions.map((option) => (
                  <SelectItem key={option.id} value={option.code}>
                    {option.name} ({option.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <RelatedUnitsTable
              units={pageItems}
              showBranch={showBranch}
              emptyMessage={
                units.length === 0
                  ? "No other units of this SKU found."
                  : "No serials match your search or status filter."
              }
            />
          </div>

          {units.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {total.toLocaleString()} match
                {total === 1 ? "" : "es"}
                {sameSku.total > units.length
                  ? ` · loaded ${units.length} of ${sameSku.total}`
                  : null}
              </span>
              {totalPages > 1 ? (
                <TablePagination
                  total={total}
                  page={page}
                  totalPages={totalPages}
                  label="serial"
                  onPageChange={setPage}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RelatedUnitsPreview({
  serial,
  className,
  onViewAll,
}: {
  serial: SerialTraceability;
  className?: string;
  onViewAll: () => void;
}) {
  const { sameSku, seriesModels } = serial.relatedUnits;
  const branchLabel = serial.current?.branch ?? null;
  const hasSiblings = sameSku.total > 0;
  const hasSeries = seriesModels.length > 0;
  const showBranch = sameSku.scope === "elsewhere";

  const sameSkuTitle =
    sameSku.scope === "branch" && branchLabel
      ? `Same SKU at ${branchLabel}`
      : "Other units of this SKU";

  const emptyHint = branchLabel
    ? "Only unit of this SKU at this branch"
    : "No other units of this SKU found";

  return (
    <div className={cn("space-y-3 border-t pt-4", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Related products
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium">{sameSkuTitle}</p>

        {hasSiblings ? (
          <RelatedUnitsTable
            units={sameSku.samples}
            showBranch={showBranch}
            compact
          />
        ) : (
          <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            {emptyHint}.
          </p>
        )}

        {hasSiblings && sameSku.total > sameSku.samples.length ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Showing {sameSku.samples.length} of {sameSku.total} — view all
          </button>
        ) : null}
      </div>

      {hasSeries ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Same series
            {branchLabel ? ` at ${branchLabel}` : ""}
          </p>
          <ul className="space-y-2">
            {seriesModels.map((model) => (
              <li key={model.id}>
                <div className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2.5 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Box className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {model.skuCode}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {model.name}
                    </span>
                  </span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {model.qtyAtBranch} unit
                    {model.qtyAtBranch === 1 ? "" : "s"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LocationCard({ serial }: { serial: SerialTraceability }) {
  const mapQuery = buildLocationQuery(serial);
  const [expanded, setExpanded] = usePersistedBoolean(
    LOCATION_CARD_EXPANDED_KEY,
    true,
  );
  const bodyId = "serial-detail-location-body";

  return (
    <Card className="h-full">
      <CollapsibleCardHeader
        title="Location & SAP"
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        controlsId={bodyId}
      />
      {expanded ? (
        <CardContent id={bodyId} className="space-y-4">
          {mapQuery && serial.current?.branch ? (
            <BranchLocationMap
              query={mapQuery}
              title={serial.current.branch}
              subtitle={serial.current.branchSapCode}
            />
          ) : null}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <DetailRow label="Region" value={serial.current?.region ?? "—"} />
            <DetailRow
              label="Province"
              value={serial.current?.province ?? "—"}
            />
            <DetailRow label="Dealer" value={serial.current?.dealer ?? "—"} />
            <DetailRow
              label="Primary warehouse"
              value={
                serial.current?.warehouseName
                  ? `${serial.current.warehouseName}${serial.current.warehouseCode ? ` (${serial.current.warehouseCode})` : ""}`
                  : (serial.current?.warehouseCode ?? "—")
              }
            />
            <DetailRow
              label="On planogram"
              value={
                serial.planogram.onPlanogram
                  ? serial.planogram.maxQty != null
                    ? `Yes · max ${serial.planogram.maxQty}`
                    : "Yes"
                  : "No"
              }
            />
            <DetailRow
              label="DR date"
              value={
                serial.deliveryReceipt.deliveryDate
                  ? dateFormatter.format(serial.deliveryReceipt.deliveryDate)
                  : "—"
              }
            />
            <DetailRow
              label="Stock updated"
              value={
                serial.current?.inventoryUpdatedAt
                  ? dateTimeFormatter.format(serial.current.inventoryUpdatedAt)
                  : "—"
              }
            />
          </dl>

          <Separator />

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <DetailRow
              label="SAP AbsEntry"
              value={
                serial.sap.absEntry != null ? String(serial.sap.absEntry) : "—"
              }
              mono
            />
            <DetailRow
              label="SAP on hand"
              value={
                serial.sap.onHandSyncedAt
                  ? serial.sap.onHand
                    ? "Yes"
                    : "No"
                  : "—"
              }
            />
            <DetailRow
              label="SAP warehouse"
              value={
                serial.sap.whsName
                  ? `${serial.sap.whsName}${serial.sap.whsCode ? ` (${serial.sap.whsCode})` : ""}`
                  : (serial.sap.whsCode ?? "—")
              }
            />
            <DetailRow
              label="Last SAP sync"
              value={
                serial.sap.syncedAt
                  ? dateTimeFormatter.format(serial.sap.syncedAt)
                  : "—"
              }
            />
            <DetailRow
              label="On-hand checked"
              value={
                serial.sap.onHandSyncedAt
                  ? dateTimeFormatter.format(serial.sap.onHandSyncedAt)
                  : "—"
              }
            />
          </dl>

          {serial.warehouseLocations.length > 0 ? (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Warehouse bins
                </p>
                <ul className="space-y-2">
                  {serial.warehouseLocations.map((loc) => (
                    <li key={loc.id}>
                      <Link
                        href={loc.href}
                        className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                      >
                        <span>
                          <span className="font-medium">{loc.warehouseName}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {loc.locationName}
                          </span>
                        </span>
                        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}

          {serial.serviceCenters.length > 0 ? (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Service centers
                </p>
                <ul className="space-y-2">
                  {serial.serviceCenters.map((sc) => (
                    <li key={sc.id}>
                      <Link
                        href={sc.href}
                        className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                      >
                        <span>
                          <span className="font-medium">{sc.name}</span>
                          {sc.location ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {sc.location}
                            </span>
                          ) : null}
                        </span>
                        {sc.status ? (
                          <StatusCodeBadge
                            code={sc.status.code}
                            name={sc.status.name}
                            color={sc.status.color}
                          />
                        ) : (
                          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function TimelineCard({ events }: { events: SerialTimelineEvent[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Lifecycle timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No lifecycle activity recorded for this serial yet.
          </p>
        ) : (
          <ol className="space-y-6">
            {events.map((event, index) => (
              <TimelineRow
                key={event.id}
                event={event}
                last={index === events.length - 1}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineRow({
  event,
  last,
}: {
  event: SerialTimelineEvent;
  last: boolean;
}) {
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{event.label}</span>
        {event.branch ? (
          <span className="text-sm text-muted-foreground">@ {event.branch}</span>
        ) : null}
        {event.status ? (
          <StatusCodeBadge
            code={event.status.code}
            name={event.status.name}
            color={event.status.color}
          />
        ) : null}
        {event.href ? (
          <ExternalLink className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      {event.detail ? (
        <p className="text-sm text-muted-foreground">{event.detail}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {dateTimeFormatter.format(event.at)}
      </p>
    </>
  );

  return (
    <li className="relative flex gap-4">
      {!last ? (
        <span
          className="absolute left-4 top-9 -bottom-6 w-px -translate-x-1/2 bg-border"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          meta.tint,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1 pt-0.5">
        {event.href ? (
          <Link
            href={event.href}
            className="group block space-y-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
    </li>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-medium", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
