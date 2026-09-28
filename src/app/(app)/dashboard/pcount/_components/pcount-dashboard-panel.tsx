"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  exportPcountDashboardExcelAction,
  getPcountBranchDetailAction,
} from "@/features/stock-audit/actions/pcount-dashboard.actions";
import type {
  PcountBranchDetail,
  PcountDashboardOverview,
} from "@/features/stock-audit/services/pcount-dashboard.service";
import { PcountBranchDetailSheet } from "@/app/(app)/dashboard/pcount/_components/pcount-branch-detail-sheet";
import { PcountDashboardKpisStrip } from "@/app/(app)/dashboard/pcount/_components/pcount-dashboard-kpis";
import { PcountDealerGroupCard } from "@/app/(app)/dashboard/pcount/_components/pcount-dealer-group-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

interface PcountDashboardPanelProps {
  overview: PcountDashboardOverview;
  currentPeriod: string;
  currentDealerId?: string;
  hasBranchAccess: boolean;
}

function downloadWorkbook(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildHref(period: string, dealerId?: string): string {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (dealerId) params.set("dealerId", dealerId);
  const query = params.toString();
  return query ? `/dashboard/pcount?${query}` : "/dashboard/pcount";
}

export function PcountDashboardPanel({
  overview,
  currentPeriod,
  currentDealerId,
  hasBranchAccess,
}: PcountDashboardPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState(currentPeriod);
  const [dealerId, setDealerId] = useState(currentDealerId ?? "");
  const [exporting, setExporting] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [detail, setDetail] = useState<PcountBranchDetail | null>(null);
  const [canManage, setCanManage] = useState(false);

  const dealerOptions = useMemo(
    () =>
      overview.dealers.map((d) => ({
        id: d.id,
        label: d.sapCode ? `${d.sapCode} · ${d.name}` : d.name,
      })),
    [overview.dealers],
  );

  const applyFilters = () => {
    startTransition(() => {
      router.push(buildHref(period, dealerId || undefined));
    });
  };

  const clearFilters = () => {
    const defaultPeriod = `${overview.period.year}-${String(overview.period.month).padStart(2, "0")}`;
    setPeriod(defaultPeriod);
    setDealerId("");
    startTransition(() => {
      router.push("/dashboard/pcount");
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportPcountDashboardExcelAction({
        period: currentPeriod,
        dealerId: currentDealerId,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      downloadWorkbook(result.base64, result.filename);
      toast.success("Excel downloaded");
    } catch {
      toast.error("Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const openBranch = (branchId: string) => {
    setSheetOpen(true);
    setSheetLoading(true);
    setDetail(null);
    startTransition(async () => {
      const result = await getPcountBranchDetailAction(branchId);
      setSheetLoading(false);
      if ("error" in result) {
        toast.error(result.error);
        setSheetOpen(false);
        return;
      }
      setDetail(result.detail);
      setCanManage(result.canManage);
    });
  };

  if (!hasBranchAccess) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to access branches in your area. Please ask
          your administrator to assign an AOR.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PcountDashboardKpisStrip
        kpis={overview.kpis}
        periodLabel={overview.period.label}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5 sm:w-44">
            <Label htmlFor="pcount-period">Period</Label>
            <Input
              id="pcount-period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <SearchableSelect
              label="Dealer"
              value={dealerId}
              onChange={setDealerId}
              options={dealerOptions}
              placeholder="All dealers"
              allowClear
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={applyFilters} disabled={pending}>
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              disabled={pending}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleExport}
              disabled={exporting || overview.kpis.branchesActive === 0}
            >
              {exporting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 size-4" />
              )}
              Export to Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {overview.groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {currentDealerId
              ? "No dealers match this filter for the selected period."
              : "No active branches to show for this period."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {overview.groups.map((group) => (
            <PcountDealerGroupCard
              key={group.groupKey}
              group={group}
              onSelectBranch={openBranch}
            />
          ))}
        </div>
      )}

      <PcountBranchDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        detail={detail}
        canManage={canManage}
        loading={sheetLoading}
      />
    </div>
  );
}
