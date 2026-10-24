"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteCustomDashboardAction } from "@/features/custom-dashboards/actions/custom-dashboard.actions";
import { CustomDashboardDetailsDialog } from "@/features/custom-dashboards/components/custom-dashboard-details-dialog";
import type { CustomDashboardVisibility } from "@/features/custom-dashboards/schemas/custom-dashboard.schema";

interface CustomDashboardRowActionsProps {
  dashboard: { id: string; name: string; description: string | null; visibility: CustomDashboardVisibility };
}

/** Owner-only controls: design, edit details, delete. */
export function CustomDashboardRowActions({ dashboard }: CustomDashboardRowActionsProps) {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const result = await deleteCustomDashboardAction({ id: dashboard.id });
      if (!result.success) {
        toast.error("Could not delete dashboard", { description: result.error });
        return;
      }
      toast.success("Dashboard deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild variant="outline">
        <Link href={`/dashboard/custom/${dashboard.id}/edit`}>Design</Link>
      </Button>
      <Button variant="outline" onClick={() => setDetailsOpen(true)}>
        Details
      </Button>
      <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmOpen(true)}>
        Delete
      </Button>

      {detailsOpen ? (
        <CustomDashboardDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} dashboard={dashboard} />
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{dashboard.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The layout is removed for everyone it was shared with. Your data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                onDelete();
              }}
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
