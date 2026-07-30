"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  applyBranchImportAction,
  downloadBranchImportTemplateAction,
  previewBranchImportAction,
} from "@/features/branches/actions/branch-import.actions";
import type { BranchImportPreview } from "@/features/branches/schemas/branch-import.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(next: boolean) {
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
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await applyBranchImportAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.result.branchesCreated} created · ${result.result.branchesUpdated} updated · ${result.result.allowedModelsAdded} allowed model${result.result.allowedModelsAdded === 1 ? "" : "s"} added`,
      );
      handleClose(false);
      router.refresh();
    });
  }

  const hasErrors = (preview?.errors.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import branches</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-muted-foreground space-y-2 text-sm">
            <p>
              The template has two sheets:{" "}
              <strong>Branches</strong> (
              <code className="font-mono text-xs">sap_code</code>,{" "}
              <code className="font-mono text-xs">branch_name</code>) and{" "}
              <strong>Allowed Models</strong> (
              <code className="font-mono text-xs">sap_code</code>,{" "}
              <code className="font-mono text-xs">sku_code</code>) — one row per model,
              repeating the branch&apos;s <code className="font-mono text-xs">sap_code</code>{" "}
              to list several.
            </p>
            <p>
              Unknown <code className="font-mono text-xs">sap_code</code> values are{" "}
              <strong>created</strong>; existing codes are updated. You can also upload a PSG
              ISMS workbook (sheet <code className="font-mono text-xs">ISMS</code> or columns
              like <code className="font-mono text-xs">BRANCH CODE</code>,{" "}
              <code className="font-mono text-xs">AREA</code>,{" "}
              <code className="font-mono text-xs">STATUS</code>, Devant / Hisense quotas).
              Product models (SKUs) must already exist. Blank cells are left untouched, and
              nothing is ever deleted.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) handleFile(selected);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 size-4" />
              {file ? "Choose another file" : "Choose file"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={handleTemplate}>
              <Download className="mr-1 size-4" />
              Download template
            </Button>
            {file ? (
              <span className="text-muted-foreground text-sm">{file.name}</span>
            ) : null}
          </div>

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 rounded-lg border px-4 py-3 text-sm">
                <span>
                  <strong>{preview.branchRowCount}</strong> branch rows ·{" "}
                  <strong>{preview.allowedModelRowCount}</strong> model rows
                </span>
                <span>
                  <strong>{preview.branchCreateCount}</strong> branches to create
                </span>
                <span>
                  <strong>{preview.branchUpdateCount}</strong> branches to update
                </span>
                <span>
                  <strong>{preview.allowedModelAddCount}</strong> allowed models to add
                </span>
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
                        <TableHead className="text-right">Allowed models</TableHead>
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
                                <div key={change.field}>
                                  {change.label}: {change.from} → <strong>{change.to}</strong>
                                </div>
                              ))
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {branch.allowedModelsToAdd.length > 0
                              ? `+${branch.allowedModelsToAdd.length}`
                              : "—"}
                          </TableCell>
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
          <Button variant="outline" onClick={() => handleClose(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={pending || !preview?.canApply}>
            {pending ? "Working…" : "Apply import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
