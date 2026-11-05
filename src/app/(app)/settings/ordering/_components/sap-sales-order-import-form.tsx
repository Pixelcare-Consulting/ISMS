"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSapSoImportSinceAction } from "@/features/ordering/actions/ordering-policy.actions";

/**
 * Start date for importing Sales Orders made directly in SAP. Empty keeps the import off;
 * SOs dated before it are never imported, so old DRs cannot move stock again.
 */
export function SapSalesOrderImportForm({
  initialSince,
  canEdit,
}: {
  initialSince: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [since, setSince] = useState(initialSince ?? "");

  function save(value: string | null) {
    startTransition(async () => {
      const result = await updateSapSoImportSinceAction({ since: value });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(value ? `Importing SAP Sales Orders dated ${value} or later` : "SAP Sales Order import is off");
      if (!value) setSince("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="sap-so-import-since">Import SOs dated from</Label>
        <Input
          id="sap-so-import-since"
          type="date"
          className="w-44"
          value={since}
          disabled={!canEdit || pending}
          onChange={(event) => setSince(event.target.value)}
        />
      </div>
      {canEdit ? (
        <>
          <Button
            type="button"
            disabled={pending || !since || since === initialSince}
            onClick={() => save(since)}
          >
            Save
          </Button>
          {initialSince ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => save(null)}>
              Turn off
            </Button>
          ) : null}
        </>
      ) : null}
      <p className="basis-full text-sm text-muted-foreground">
        {initialSince
          ? `On. Each SAP check imports open SOs, and closed SOs that have a DR, dated ${initialSince} or later.`
          : "Off. No Sales Orders are imported from SAP."}
      </p>
    </div>
  );
}
