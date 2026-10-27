"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  listSerialSyncTargetOptionsAction,
  syncSerialNumbersTargetFromSapAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import {
  SERIAL_SYNC_TARGET_KINDS,
  SERIAL_SYNC_TARGET_LABELS,
  SERIAL_SYNC_TARGET_MAX_VALUES,
  type SerialSyncTargetKind,
} from "@/features/serial-numbers/constants/serial-sync-target";
import {
  runSapSync,
  useSapSyncPending,
  type SapSyncResponse,
} from "@/features/sap/hooks/use-sap-sync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

/** Its own key, so a targeted run and a full sync each keep their own progress modal. */
const SYNC_KEY = "serial-number:target";
const NOUN = { one: "serial number", many: "serial numbers" };

type TargetOptions = Awaited<ReturnType<typeof listSerialSyncTargetOptionsAction>>;
type PickerKind = Exclude<SerialSyncTargetKind, "SERIAL">;

const KIND_HINTS: Record<SerialSyncTargetKind, string> = {
  SERIAL: "Re-reads these serials from SAP, including their warehouse.",
  MODEL: "Re-reads every SAP serial of these models.",
  BRAND: "Re-reads every SAP serial of the models under these brands.",
  BRANCH:
    "Re-reads the serials SAP holds in these branches' warehouses, and the serials ISMS last saw there.",
  WAREHOUSE:
    "Re-reads the serials SAP holds in these warehouses, and the serials ISMS last saw there.",
};

function toPickerOptions(options: TargetOptions, kind: PickerKind): SearchableOption[] {
  switch (kind) {
    case "MODEL":
      return options.models.map((row) => ({ id: row.id, label: row.skuCode, description: row.name }));
    case "BRAND":
      return options.brands.map((row) => ({ id: row.id, label: row.name }));
    case "BRANCH":
      return options.branches.map((row) => ({ id: row.id, label: row.name, description: row.sapCode }));
    case "WAREHOUSE":
      return options.warehouses.map((row) => ({ id: row.id, label: row.name, description: row.code }));
  }
}

/** Pasted serials: one per line, or separated by commas, tabs or spaces. */
function parseSerials(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
}

/**
 * "Sync selected" for serial numbers: re-read from SAP only the serials, models, brands,
 * branches or warehouses picked here, instead of walking every serial ISMS carries.
 *
 * The run itself goes through the shared `runSapSync`, so it gets the same progress modal,
 * Stop button and skip report as the full sync. Each slice hands back a `resume` token,
 * which this closure keeps and sends with the next slice.
 */
export function SerialTargetedSyncDialog() {
  const router = useRouter();
  const pending = useSapSyncPending(SYNC_KEY);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SerialSyncTargetKind>("SERIAL");
  const [serialText, setSerialText] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [options, setOptions] = useState<TargetOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const serials = useMemo(() => parseSerials(serialText), [serialText]);
  const values = kind === "SERIAL" ? serials : selectedIds;
  const tooMany = values.length > SERIAL_SYNC_TARGET_MAX_VALUES;
  const canSubmit = values.length > 0 && !tooMany && !pending;

  async function loadOptions() {
    if (options || loadingOptions) return;
    setLoadingOptions(true);
    setOptionsError(null);
    try {
      setOptions(await listSerialSyncTargetOptionsAction());
    } catch (error) {
      setOptionsError(error instanceof Error ? error.message : "Could not load the choices");
    } finally {
      setLoadingOptions(false);
    }
  }

  function changeKind(next: string) {
    const nextKind = SERIAL_SYNC_TARGET_KINDS.find((value) => value === next);
    if (!nextKind) return;
    setKind(nextKind);
    setSelectedIds([]);
    if (nextKind !== "SERIAL") void loadOptions();
  }

  function submit() {
    if (!canSubmit) return;
    const target = { kind, values };
    let resume: string | null = null;

    const action = async (): Promise<SapSyncResponse> => {
      const response = await syncSerialNumbersTargetFromSapAction({ target, resume });
      if (response.success) resume = response.result.resume ?? null;
      return response;
    };

    runSapSync(SYNC_KEY, NOUN, action, () => router.refresh());
    setOpen(false);
  }

  const pickerOptions = options && kind !== "SERIAL" ? toPickerOptions(options, kind) : [];
  const label = SERIAL_SYNC_TARGET_LABELS[kind];

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        {pending ? "Syncing selected…" : "Sync selected"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sync selected serial numbers</DialogTitle>
            <DialogDescription>
              Pull only what you pick from SAP. The full sync keeps its place, and nothing is
              removed from ISMS by this run.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <SearchableSelect
              id="serial-target-kind"
              label="Sync by"
              options={SERIAL_SYNC_TARGET_KINDS.map((value) => ({
                id: value,
                label: SERIAL_SYNC_TARGET_LABELS[value],
              }))}
              value={kind}
              onChange={changeKind}
              searchPlaceholder="Search…"
              popoverClassName="z-70"
            />

            {kind === "SERIAL" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="serial-target-values">Serial numbers</Label>
                <Textarea
                  id="serial-target-values"
                  value={serialText}
                  onChange={(event) => setSerialText(event.target.value)}
                  placeholder="One serial per line"
                  className="min-h-28 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {serials.length > 0
                    ? `${serials.length.toLocaleString()} serial(s) listed.`
                    : "Separate serials with a new line or a comma."}
                </p>
              </div>
            ) : (
              <SearchableMultiSelect
                label={label}
                options={pickerOptions}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                placeholder={loadingOptions ? "Loading…" : `Select ${label.toLowerCase()}…`}
                searchPlaceholder={`Search ${label.toLowerCase()}…`}
                emptyMessage={optionsError ?? `No ${label.toLowerCase()} in ISMS.`}
                disabled={loadingOptions || Boolean(optionsError)}
                showSelectedBadges={false}
                popoverClassName="z-70"
              />
            )}

            {optionsError && kind !== "SERIAL" ? (
              <p className="text-sm text-destructive">{optionsError}</p>
            ) : null}
            {tooMany ? (
              <p className="text-sm text-destructive">
                At most {SERIAL_SYNC_TARGET_MAX_VALUES.toLocaleString()} at a time.
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">{KIND_HINTS[kind]}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              Sync from SAP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
