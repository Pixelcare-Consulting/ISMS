"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  applyBranchImportChunkAction,
  downloadBranchImportTemplateAction,
  previewBranchImportAction,
} from "@/features/branches/actions/branch-import.actions";
import type {
  BranchImportChunkPhase,
  BranchImportPreview,
  BranchImportResult,
} from "@/features/branches/schemas/branch-import.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportApplyProgress } from "@/components/ui/import-apply-progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Turn the base64 workbook from the server action into a file download. */
function downloadWorkbook(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function phaseLabel(phase: BranchImportChunkPhase): string {
  return phase === "core" ? "Saving branches…" : "Updating details…";
}

function plannedFromPreview(preview: BranchImportPreview): BranchImportResult {
  return {
    branchesCreated: preview.branchCreateCount,
    branchesUpdated: preview.branchUpdateCount,
    allowedModelsAdded: preview.allowedModelAddCount,
    unchanged: preview.unchangedCount,
  };
}

export function ImportBranchesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BranchImportPreview | null>(null);
  const [pending, startTransition] = useTransition();
  const [applyProgress, setApplyProgress] = useState<{
    label: string;
    processed: number;
    total: number;
    elapsedMs: number;
  } | null>(null);

  const applying = applyProgress !== null;
  const busy = pending || applying;

  function reset() {
    setFile(null);
    setPreview(null);
    setApplyProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(next: boolean) {
    if (applying) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleTemplate() {
    startTransition(async () => {
      const base64 = await downloadBranchImportTemplateAction();
      downloadWorkbook(base64, "branches-import-template.xlsx");
    });
  }

  function handleFile(selected: File) {
    setFile(selected);
    setPreview(null);
    const formData = new FormData();
    formData.set("file", selected);
    startTransition(async () => {
      const result = await previewBranchImportAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        reset();
        return;
      }
      setPreview(result.preview);
    });
  }

  function handleApply() {
    if (!file || !preview || applying) return;

    const planned = plannedFromPreview(preview);
    const startedAtMs = Date.now();

    startTransition(async () => {
      let phase: BranchImportChunkPhase = "core";
      let offset = 0;
      let lastProcessed = 0;
      let lastTotal = 0;
      let lastPhase: BranchImportChunkPhase = "core";
      let plannedResult = planned;

      setApplyProgress({
        label: phaseLabel("core"),
        processed: 0,
        total: 0,
        elapsedMs: 0,
      });

      // Normally only the plan key travels; the workbook is re-sent solely when the
      // server reports its cached plan is gone, so a 5 MB file is not uploaded per chunk.
      let planKey = preview.planKey;
      let resendFile = !planKey;

      try {
        for (;;) {
          const formData = new FormData();
          if (resendFile || !planKey) formData.set("file", file);
          if (planKey) formData.set("planKey", planKey);
          formData.set("phase", phase);
          formData.set("offset", String(offset));
          formData.set("plannedCreated", String(plannedResult.branchesCreated));
          formData.set("plannedUpdated", String(plannedResult.branchesUpdated));
          formData.set("plannedAllowed", String(plannedResult.allowedModelsAdded));
          formData.set("plannedUnchanged", String(plannedResult.unchanged));

          const progress = await applyBranchImportChunkAction(formData);
          if ("error" in progress) {
            toast.error(
              `${progress.error} Stopped after ${lastProcessed} of ${lastTotal || "?"} (${lastPhase === "core" ? "saving branches" : "updating details"}). You can try Apply again.`,
            );
            setApplyProgress(null);
            return;
          }

          if (progress.planExpired) {
            // Nothing was written for this offset. Retry it once with the workbook
            // attached; a second miss means the server could not rebuild the plan.
            if (resendFile) {
              toast.error(
                `Import failed. Stopped after ${lastProcessed} of ${lastTotal || "?"}. You can try Apply again.`,
              );
              setApplyProgress(null);
              return;
            }
            resendFile = true;
            continue;
          }

          resendFile = false;
          if (progress.planKey) planKey = progress.planKey;
          if (progress.plannedResult) {
            plannedResult = progress.plannedResult;
          }

          lastProcessed = progress.processed;
          lastTotal = progress.total;
          lastPhase = phase;

          setApplyProgress({
            label: phaseLabel(phase),
            processed: progress.processed,
            total: progress.total,
            elapsedMs: Date.now() - startedAtMs,
          });

          if (progress.done) {
            const result = progress.result ?? plannedResult;
            toast.success(
              `${result.branchesCreated} created · ${result.branchesUpdated} updated · ${result.allowedModelsAdded} allowed model${result.allowedModelsAdded === 1 ? "" : "s"} added`,
            );
            setApplyProgress(null);
            handleClose(false);
            router.refresh();
            return;
          }

          phase = progress.phase;
          offset = progress.nextOffset;
        }
      } catch (error) {
        toast.error(
          `${error instanceof Error ? error.message : "Import failed."} Stopped after ${lastProcessed} of ${lastTotal || "?"}. You can try Apply again.`,
        );
        setApplyProgress(null);
      }
    });
  }

  const hasErrors = (preview?.errors.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!applying}
        onPointerDownOutside={(event) => {
          if (applying) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (applying) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import branches</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-muted-foreground text-sm">
            <p>
              The download template is a single <strong>Branches</strong> sheet with columns for
              SAP code, name, status, dealer, warehouse, geo, alternate branches, and delivery
              schedule — pre-filled from your active branches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) handleFile(selected);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 size-4" />
              {file ? "Choose another file" : "Choose file"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={handleTemplate}>
              <Download className="mr-1 size-4" />
              Download template
            </Button>
            {file ? (
              <span className="text-muted-foreground text-sm">{file.name}</span>
            ) : null}
          </div>

          {applyProgress ? (
            <ImportApplyProgress
              label={applyProgress.label}
              processed={applyProgress.processed}
              total={applyProgress.total}
              elapsedMs={applyProgress.elapsedMs}
            />
          ) : null}

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 rounded-lg border px-4 py-3 text-sm">
                <span>
                  <strong>{preview.branchRowCount}</strong> branch rows
                  {preview.allowedModelRowCount > 0 ? (
                    <>
                      {" "}
                      · <strong>{preview.allowedModelRowCount}</strong> model rows
                    </>
                  ) : null}
                </span>
                <span>
                  <strong>{preview.branchCreateCount}</strong> branches to create
                </span>
                <span>
                  <strong>{preview.branchUpdateCount}</strong> branches to update
                </span>
                {preview.allowedModelRowCount > 0 || preview.allowedModelAddCount > 0 ? (
                  <span>
                    <strong>{preview.allowedModelAddCount}</strong> allowed models to add
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {preview.unchangedCount} unchanged (skipped)
                </span>
              </div>

              {hasErrors ? (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-destructive text-sm font-medium">
                    {preview.errors.length} problem
                    {preview.errors.length === 1 ? "" : "s"} found — fix the spreadsheet and
                    upload again.
                  </p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                    {preview.errors.slice(0, 100).map((error, index) => (
                      <li key={`${error.sheet}-${error.rowNumber}-${index}`}>
                        <span className="text-muted-foreground">
                          {error.sheet} · row {error.rowNumber}
                        </span>{" "}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                  {preview.errors.length > 100 ? (
                    <p className="text-muted-foreground text-xs">
                      Showing the first 100 of {preview.errors.length}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {preview.branches.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SAP code</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Changes</TableHead>
                        {preview.allowedModelRowCount > 0 ||
                        preview.branches.some((b) => b.allowedModelsToAdd.length > 0) ? (
                          <TableHead className="text-right">Allowed models</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.branches.map((branch) => (
                        <TableRow key={branch.branchId}>
                          <TableCell className="font-mono text-xs">{branch.sapCode}</TableCell>
                          <TableCell>{branch.name}</TableCell>
                          <TableCell className="text-sm">
                            {branch.isCreate ? "Create" : "Update"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {branch.changes.length === 0 ? (
                              <span className="text-muted-foreground">No field changes</span>
                            ) : (
                              branch.changes.map((change) => (
                                <div key={`${change.field}-${change.to}`}>
                                  {change.label}: {change.from} → <strong>{change.to}</strong>
                                </div>
                              ))
                            )}
                          </TableCell>
                          {preview.allowedModelRowCount > 0 ||
                          preview.branches.some((b) => b.allowedModelsToAdd.length > 0) ? (
                            <TableCell className="text-right text-sm">
                              {branch.allowedModelsToAdd.length > 0
                                ? `+${branch.allowedModelsToAdd.length}`
                                : "—"}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : !hasErrors ? (
                <p className="text-muted-foreground text-sm">
                  Everything in this file already matches the system. Nothing to import.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={busy || !preview?.canApply}>
            {applying ? "Importing…" : pending ? "Working…" : "Apply import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
