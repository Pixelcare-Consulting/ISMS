"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CustomDashboardDetailsDialog } from "@/features/custom-dashboards/components/custom-dashboard-details-dialog";

export function NewCustomDashboardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New dashboard</Button>
      {open ? <CustomDashboardDetailsDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
