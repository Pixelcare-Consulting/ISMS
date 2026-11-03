"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { checkSapCopyToNowAction } from "@/features/logistics/actions/logistics.actions";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/**
 * Check SAP for Copy To documents (ITR → IT, SO → DR) and Sales Orders made in SAP now,
 * instead of waiting for the scheduled check. Applies whatever it finds, the same as the
 * scheduled check does.
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
      const notApplied = result.failed + result.flagged;
      const imported =
        result.importedOrders > 0
          ? `Imported ${plural(result.importedOrders, "Sales Order")} made in SAP.`
          : undefined;
      if (result.applied === 0 && notApplied === 0) {
        if (imported) toast.success(imported);
        else toast.info("No new SAP documents for deliveries");
      } else if (notApplied === 0) {
        toast.success(`Added ${plural(result.applied, "SAP document")} to deliveries`, {
          description: imported,
        });
      } else {
        toast.warning(
          `${plural(notApplied, "SAP document")} could not be added`,
          {
            description:
              result.applied > 0
                ? `${plural(result.applied, "other")} were added. Open the delivery to see why.${imported ? ` ${imported}` : ""}`
                : `Open the delivery to see why.${imported ? ` ${imported}` : ""}`,
          },
        );
      }
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
