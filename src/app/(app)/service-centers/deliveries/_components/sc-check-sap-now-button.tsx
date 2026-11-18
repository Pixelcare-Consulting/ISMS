"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { checkScOrdersInSapAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import { summarizeScOrderSapCheck } from "@/features/service-center-ordering/lib/sc-order-sap-check";

/**
 * Brings in the DRs SAP users copied from approved SC orders' Sales Orders, each as an SC
 * delivery with its serials DIT. SC orders have no scheduled check, so this is the only trigger.
 */
export function ScCheckSapNowButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function check() {
    startTransition(async () => {
      const result = await checkScOrdersInSapAction();
      if ("error" in result) {
        toast.error("Could not check SAP", { description: result.error });
        return;
      }
      const summary = summarizeScOrderSapCheck(result);
      toast[summary.tone](summary.title, { description: summary.description });
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size={size} disabled={pending} onClick={check}>
      <RefreshCw className={`mr-1 size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
      {pending ? "Checking SAP…" : "Check SAP now"}
    </Button>
  );
}
