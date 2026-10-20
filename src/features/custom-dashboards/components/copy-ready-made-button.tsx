"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyReadyMadeDashboardAction } from "@/features/custom-dashboards/actions/custom-dashboard.actions";
import type { ReadyMadeDashboardKey } from "@/features/custom-dashboards/ready-made/ready-made-dashboards";

export function CopyReadyMadeButton({ readyMadeKey }: { readyMadeKey: ReadyMadeDashboardKey }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onCopy() {
    startTransition(async () => {
      const result = await copyReadyMadeDashboardAction({ key: readyMadeKey });
      if (!result.success) {
        toast.error("Could not copy dashboard", { description: result.error });
        return;
      }
      toast.success("Copied to your dashboards");
      router.push(`/dashboard/custom/${result.id}/edit`);
    });
  }

  return (
    <Button onClick={onCopy} disabled={pending}>
      {pending ? "Copying…" : "Copy and customize"}
    </Button>
  );
}
