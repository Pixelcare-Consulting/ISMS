"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { linkPulloutSapDocumentAction } from "@/features/logistics/actions/logistics.actions";
import {
  formatPulloutSapDoc,
  isPulloutSapDocType,
  parseSapDocNum,
  PULLOUT_SAP_DOC_TYPE_DESCRIPTION,
  PULLOUT_SAP_DOC_TYPE_LABEL,
  PULLOUT_SAP_DOC_TYPES,
  type PulloutSapDocType,
} from "@/features/logistics/lib/pullout-sap-document";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

const FORM_ID = "pullout-sap-document-form";

type Line = Pick<PulloutDetail["lines"][number], "serialNumberId" | "serialNo" | "skuCode" | "sapDocument">;

/** Units with no link are picked by default; a linked unit can be picked to replace its link. */
function defaultSelection(lines: readonly Line[]): string[] {
  return lines.filter((line) => !line.sapDocument).map((line) => line.serialNumberId);
}

export function PulloutSapDocumentDialog({
  open,
  onOpenChange,
  pulloutId,
  lines,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pulloutId: string;
  lines: readonly Line[];
  onLinked: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState<PulloutSapDocType>("IT");
  const [docNum, setDocNum] = useState("");
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(lines));
  const [error, setError] = useState<string | null>(null);

  const selectedSet = new Set(selected);
  const allSelected = lines.length > 0 && selected.length === lines.length;
  const parsedNum = parseSapDocNum(docNum);
  const ready = parsedNum !== null && selected.length > 0;
  const replacing = lines.filter((line) => line.sapDocument && selectedSet.has(line.serialNumberId)).length;

  function reset() {
    setDocType("IT");
    setDocNum("");
    setSelected(defaultSelection(lines));
    setError(null);
  }

  function close(next: boolean) {
    if (pending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function toggle(serialNumberId: string, on: boolean) {
    setSelected((current) =>
      on
        ? current.includes(serialNumberId)
          ? current
          : [...current, serialNumberId]
        : current.filter((id) => id !== serialNumberId),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await linkPulloutSapDocumentAction(pulloutId, {
        serialNumberIds: selected,
        docType,
        docNum,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        `SAP ${result.label} linked to ${result.linkedCount} ${result.linkedCount === 1 ? "unit" : "units"}`,
      );
      reset();
      onOpenChange(false);
      onLinked();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
          <DialogTitle>Link SAP document</DialogTitle>
          <DialogDescription>
            Enter the IT or Return you created in SAP for these units. ISMS checks that the
            document exists and lists each selected serial. Nothing is posted to SAP.
          </DialogDescription>
        </DialogHeader>
        <form
          id={FORM_ID}
          onSubmit={submit}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pullout-sap-doc-type">Document type</Label>
              <Select
                value={docType}
                onValueChange={(value) => {
                  if (isPulloutSapDocType(value)) setDocType(value);
                }}
                disabled={pending}
              >
                <SelectTrigger id="pullout-sap-doc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PULLOUT_SAP_DOC_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {`${PULLOUT_SAP_DOC_TYPE_LABEL[type]} (${PULLOUT_SAP_DOC_TYPE_DESCRIPTION[type]})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pullout-sap-doc-num">Document number</Label>
              <Input
                id="pullout-sap-doc-num"
                inputMode="numeric"
                autoComplete="off"
                value={docNum}
                disabled={pending}
                placeholder="e.g. 494405"
                aria-invalid={docNum.trim() !== "" && parsedNum === null}
                onChange={(event) => setDocNum(event.target.value)}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-medium">Units on this document</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected || (selected.length > 0 ? "indeterminate" : false)}
                  onCheckedChange={(value) =>
                    setSelected(value === true ? lines.map((line) => line.serialNumberId) : [])
                  }
                  disabled={pending || lines.length === 0}
                />
                Select all
              </label>
            </div>
            <ul className="divide-y rounded-md border">
              {lines.map((line) => (
                <li key={line.serialNumberId}>
                  <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      checked={selectedSet.has(line.serialNumberId)}
                      onCheckedChange={(value) => toggle(line.serialNumberId, value === true)}
                      disabled={pending}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono">{line.serialNo}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {line.skuCode}
                      </span>
                    </span>
                    {line.sapDocument ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatPulloutSapDoc(line.sapDocument.type, line.sapDocument.docNum)}
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            {replacing > 0 ? (
              <p className="text-sm text-muted-foreground">
                {`${replacing} selected ${replacing === 1 ? "unit already has" : "units already have"} a link. Saving replaces it.`}
              </p>
            ) : null}
          </fieldset>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:px-6">
          <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={!ready || pending}>
            {pending ? "Checking SAP…" : "Link document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
