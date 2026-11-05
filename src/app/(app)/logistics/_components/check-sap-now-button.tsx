"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { checkSapCopyToNowAction } from "@/features/logistics/actions/logistics.actions";
import { summarizeSapCheck } from "@/features/logistics/lib/sap-check-summary";

/**
 * Check SAP for Copy To documents (ITR → IT, SO → DR) and Sales Orders made in SAP now,
 * instead of waiting for the scheduled check. Applies whatever it finds, the same as the
 * scheduled check does. Sits on Deliveries and on Orders, where those imported orders land.
 */
export function CheckSapNowButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function check() {
    startTransition(async () => {
      const result = await checkSapCopyToNowAction();
      if ("error" in result) {
        toast.error("Could not check SAP", { description: result.error });
        return;
      }
      const summary = summarizeSapCheck(result);
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
