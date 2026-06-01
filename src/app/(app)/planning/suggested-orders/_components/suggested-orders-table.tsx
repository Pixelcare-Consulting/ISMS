"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  generateSuggestedOrdersAction,
  submitSuggestedOrdersAction,
} from "@/features/forecast/actions/forecast.actions";
import { AllocationGapsTable } from "@/features/forecast/components/allocation-gaps-table";
import { DraftSuggestedOrdersTable } from "@/features/forecast/components/draft-suggested-orders-table";
import { Button } from "@/components/ui/button";

interface DraftOrder {
  id: string;
  orderNumber: string;
  status: string;
  branch: { id: string; name: string };
  details: { quantity: number; model: { skuCode: string; name: string } }[];
}

interface GapRow {
  id: string;
  gapQty: number;
  planogramMax: number;
  currentStock: number;
  branch: { name: string };
  model: { skuCode: string; name: string };
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export function SuggestedOrdersTable({
  draftsResult,
  gapsResult,
  branches,
  periodId,
  currentDraftBranch,
  currentDraftQ,
  currentGapBranch,
  currentGapQ,
  draftsPreserveParams,
  gapsPreserveParams,
}: {
  draftsResult: Paginated<DraftOrder>;
  gapsResult: Paginated<GapRow>;
  branches: { id: string; name: string }[];
  periodId: string | null;
  currentDraftBranch?: string;
  currentDraftQ?: string;
  currentGapBranch?: string;
  currentGapQ?: string;
  draftsPreserveParams: Record<string, string>;
  gapsPreserveParams: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function generate() {
    if (!periodId) {
      toast.error("No active planning period");
      return;
    }
    startTransition(async () => {
      const result = await generateSuggestedOrdersAction(periodId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created ${result.orders?.length ?? 0} draft order(s)`);
      router.refresh();
    });
  }

  function submitAll() {
    startTransition(async () => {
      const result = await submitSuggestedOrdersAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Submitted ${result.orders?.length ?? 0} order(s) for TL review`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !periodId} onClick={generate}>
          Generate from allocation
        </Button>
        <Button
          variant="outline"
          disabled={pending || draftsResult.total === 0}
          onClick={submitAll}
        >
          Submit all for TL review
        </Button>
      </div>

      <DraftSuggestedOrdersTable
        basePath="/planning/suggested-orders"
        result={draftsResult}
        branches={branches}
        currentBranch={currentDraftBranch}
        currentQ={currentDraftQ}
        preserveParams={draftsPreserveParams}
      />

      <AllocationGapsTable
        basePath="/planning/suggested-orders"
        pageParam="gapsPage"
        result={gapsResult}
        branches={branches}
        currentBranch={currentGapBranch}
        currentQ={currentGapQ}
        preserveParams={gapsPreserveParams}
        showStockColumns={false}
        suggestedQtyLabel
        emptyMessage="No gaps with qty > 0."
      />
    </div>
  );
}
