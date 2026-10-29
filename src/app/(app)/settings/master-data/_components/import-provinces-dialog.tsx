"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  applyProvinceImportAction,
  downloadProvinceImportTemplateAction,
  previewProvinceImportAction,
} from "@/features/lookups/actions/province-import.actions";
import type {
  ProvinceImportPreview,
  ProvinceImportRowAction,
} from "@/features/lookups/schemas/province-import.schema";
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
const MAX_LISTED_ERRORS = 100;

const ACTION_LABELS: Record<ProvinceImportRowAction, string> = {
  create: "Create",
  update: "Update",
};

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

/** Toolbar button plus the import dialog it opens. */
export function ImportProvincesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Import
      </Button>
      <ImportProvincesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ImportProvincesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProvinceImportPreview | null>(null);
  const [applying, setApplying] = useState(false);
  const [pending, startTransition] = useTransition();

  const busy = pending || applying;

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(next: boolean) {
    if (applying) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleTemplate() {
    startTransition(async () => {
      try {
        const base64 = await downloadProvinceImportTemplateAction();
        downloadWorkbook(base64, "provinces-import-template.xlsx");
      } catch {
        toast.error("Could not build the template.");
      }
    });
  }

  function handleFile(selected: File) {
    setFile(selected);
    setPreview(null);
    const formData = new FormData();
    formData.set("file", selected);
    startTransition(async () => {
      const result = await previewProvinceImportAction(formData);
      if ("error" in result) {
        toast.error(result.error);
        reset();
        return;
      }
      setPreview(result.preview);
    });
  }

  function handleApply() {
    if (!file || !preview?.canApply || applying) return;
    const formData = new FormData();
    formData.set("file", file);
    setApplying(true);
    startTransition(async () => {
      try {
        const result = await applyProvinceImportAction(formData);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        const { created, updated, unchanged } = result.result;
        toast.success(`${created} created · ${updated} updated · ${unchanged} unchanged`);
        handleClose(false);
        router.refresh();
      } catch {
        toast.error("Import failed.");
      } finally {
        setApplying(false);
      }
    });
  }

  const hasErrors = (preview?.errors.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!applying}
        onPointerDownOutside={(event) => {
          if (applying) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (applying) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import provinces</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-muted-foreground space-y-2 text-sm">
            <p>
              Download the <strong>Provinces</strong> template (it lists your current
              provinces), edit or add rows, then upload that same file. Regions are matched by
              name and must already exist and be active.
            </p>
            <p>
              Rows match an existing province by name, ignoring case. Unmatched rows create a
              province. Blank region or status cells leave the field as it is; rows left out of
              the file are not removed.
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
            {file ? <span className="text-muted-foreground text-sm">{file.name}</span> : null}
          </div>

          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 rounded-lg border px-4 py-3 text-sm">
                <span>
                  <strong>{preview.rowCount}</strong> rows
                </span>
                <span>
                  <strong>{preview.createCount}</strong> to create
                </span>
                <span>
                  <strong>{preview.updateCount}</strong> to update
                </span>
                <span className="text-muted-foreground">
                  {preview.unchangedCount} unchanged (skipped)
                </span>
              </div>

              {hasErrors ? (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-destructive text-sm font-medium">
                    {preview.errors.length} problem{preview.errors.length === 1 ? "" : "s"}{" "}
                    found. Fix the spreadsheet and upload again.
                  </p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                    {preview.errors.slice(0, MAX_LISTED_ERRORS).map((error, index) => (
                      <li key={`${error.rowNumber}-${index}`}>
                        <span className="text-muted-foreground">
                          Row {error.rowNumber}
                          {error.province !== "—" ? ` · ${error.province}` : ""}
                        </span>{" "}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                  {preview.errors.length > MAX_LISTED_ERRORS ? (
                    <p className="text-muted-foreground text-xs">
                      Showing the first {MAX_LISTED_ERRORS} of {preview.errors.length}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {preview.rows.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Province</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Changes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="text-sm font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm">{ACTION_LABELS[row.action]}</TableCell>
                          <TableCell className="text-sm">
                            {row.changes.map((change) => (
                              <div key={change.label}>
                                {change.label}:{" "}
                                {row.action === "update" ? `${change.from} → ` : null}
                                <strong>{change.to}</strong>
                              </div>
                            ))}
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
