"use client";

import { useEffect, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  listBranchesForLogisticsAction,
  listPulloutChecklistOptionsAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
  type PulloutChecklistOptions,
  uploadPulloutAttachmentAction,
} from "@/features/logistics/actions/logistics.actions";
import {
  PULLOUT_ATTACHMENT_ACCEPT,
  PULLOUT_ATTACHMENT_MAX_FILES,
  pulloutAttachmentError,
} from "@/features/logistics/constants/pullout-attachments";
import {
  PULLOUT_LINE_REMARKS_MAX,
  type PulloutCondition,
} from "@/features/logistics/services/pullout-posting.planner";
import type {
  PulloutCreateInput,
  PulloutSerialOption,
} from "@/features/logistics/services/pullout-posting.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PULLOUT_CREATE_FORM_ID = "pullout-create-form";
const POPOVER_CLASS = "z-[100]";
const SERIAL_PAGE_SIZE = 10;
const EMPTY_LOOKUP_MESSAGE = "No active names. Add them in Settings → Master data.";

const EMPTY_CHECKLIST_OPTIONS: PulloutChecklistOptions = {
  classifications: [],
  unitPackingConditions: [],
  accessoryCompleteness: [],
};

const MANILA_DATE = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Asia/Manila",
});

const CONDITION_OPTIONS: { code: PulloutCondition; title: string; description: string }[] = [
  {
    code: "STK",
    title: "Stock",
    description: "Good units going back to the warehouse.",
  },
  {
    code: "DEF",
    title: "Defective",
    description: "Units already marked defective at the branch.",
  },
];

type ChecklistField =
  | "pulloutClassificationIds"
  | "unitPackingConditionIds"
  | "accessoryCompletenessIds";

interface PulloutLineChoice {
  pulloutClassificationIds: string[];
  unitPackingConditionIds: string[];
  accessoryCompletenessIds: string[];
  remarks: string;
}

const EMPTY_CHOICE: PulloutLineChoice = {
  pulloutClassificationIds: [],
  unitPackingConditionIds: [],
  accessoryCompletenessIds: [],
  remarks: "",
};

interface PulloutRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    input: PulloutCreateInput,
  ) => Promise<{ error?: string; id?: string; pulloutNo?: string }>;
  onCreated: () => void;
  currentUserName?: string;
}

function serialMatches(serial: PulloutSerialOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    serial.skuCode.toLowerCase().includes(needle) ||
    serial.modelName.toLowerCase().includes(needle) ||
    serial.serialNo.toLowerCase().includes(needle)
  );
}

function choiceFor(
  choices: Readonly<Record<string, PulloutLineChoice>>,
  serialNumberId: string,
): PulloutLineChoice {
  return choices[serialNumberId] ?? EMPTY_CHOICE;
}

function checklistReady(
  condition: PulloutCondition,
  selectedIds: readonly string[],
  choices: Readonly<Record<string, PulloutLineChoice>>,
): boolean {
  return selectedIds.every((serialNumberId) => {
    const choice = choices[serialNumberId];
    return Boolean(
      choice &&
        (condition === "DEF" || choice.pulloutClassificationIds.length > 0) &&
        choice.unitPackingConditionIds.length > 0 &&
        choice.accessoryCompletenessIds.length > 0,
    );
  });
}

async function uploadAttachments(pulloutId: string, files: readonly File[]): Promise<string | null> {
  for (const file of files) {
    const formData = new FormData();
    formData.set("pulloutId", pulloutId);
    formData.set("file", file);
    const result = await uploadPulloutAttachmentAction(formData);
    if ("error" in result) return `${file.name}: ${result.error}`;
  }
  return null;
}

function Field({
  label,
  htmlFor,
  wide = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-sm text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ConditionPrompt({ onChoose }: { onChoose: (condition: PulloutCondition) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CONDITION_OPTIONS.map((option) => (
        <button
          key={option.code}
          type="button"
          className="flex min-h-28 flex-col items-start gap-2 rounded-md border bg-background p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => onChoose(option.code)}
        >
          <StatusCodeBadge code={option.code} name={option.code} />
          <span className="font-medium">{option.title}</span>
          <span className="text-sm text-muted-foreground">{option.description}</span>
        </button>
      ))}
    </div>
  );
}

function ModelCell({ skuCode, name }: { skuCode: string; name: string }) {
  const title = name ? `${skuCode} — ${name}` : skuCode;
  return (
    <div className="min-w-0" title={title}>
      <p className="truncate">{skuCode}</p>
      {name ? <p className="truncate text-xs text-muted-foreground">{name}</p> : null}
    </div>
  );
}

function ChecklistGroup({
  label,
  options,
  selectedIds,
  onToggle,
  disabled,
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedIds: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
  disabled: boolean;
}) {
  const selected = new Set(selectedIds);
  return (
    <fieldset className="min-w-0 space-y-2" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{EMPTY_LOOKUP_MESSAGE}</p>
      ) : (
        <ul className="space-y-1.5">
          {options.map((option) => (
            <li key={option.id}>
              <label className="flex items-start gap-2 text-sm leading-snug">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(option.id)}
                  onCheckedChange={(value) => onToggle(option.id, value === true)}
                  disabled={disabled}
                  aria-label={`${label}: ${option.name}`}
                />
                <span>{option.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

export function PulloutRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  onCreated,
  currentUserName = "",
}: PulloutRequestDialogProps) {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [condition, setCondition] = useState<PulloutCondition | null>(null);
  const [serials, setSerials] = useState<PulloutSerialOption[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, PulloutLineChoice>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [checklistOptions, setChecklistOptions] = useState<PulloutChecklistOptions>(EMPTY_CHECKLIST_OPTIONS);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      listBranchesForLogisticsAction(),
      listWarehousesForLogisticsAction(),
      listPulloutChecklistOptionsAction(),
    ]).then(([branchRows, warehouseRows, checklist]) => {
      if (cancelled) return;
      setBranches(branchRows);
      setWarehouses(warehouseRows);
      if (checklist.error) {
        setChecklistOptions(EMPTY_CHECKLIST_OPTIONS);
        toast.error(checklist.error);
      } else {
        setChecklistOptions({
          classifications: checklist.classifications,
          unitPackingConditions: checklist.unitPackingConditions,
          accessoryCompleteness: checklist.accessoryCompleteness,
        });
      }
      setBranchId((current) => current || branchRows[0]?.id || "");
      setWarehouseId((current) => current || warehouseRows[0]?.id || "");
      setListsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const serialsKey = condition && branchId ? `${branchId}:${condition}` : null;

  useEffect(() => {
    if (!open || !branchId || !condition) return;
    let cancelled = false;
    const requestedKey = `${branchId}:${condition}`;
    void listPulloutSerialsAction(branchId, condition).then((result) => {
      if (cancelled) return;
      setLoadedKey(requestedKey);
      setSelected([]);
      setChoices({});
      setQuery("");
      setPage(1);
      if ("error" in result && result.error) {
        setSerials([]);
        toast.error(result.error);
        return;
      }
      if (!("serials" in result)) {
        setSerials([]);
        return;
      }
      setSerials(result.serials);
    });
    return () => {
      cancelled = true;
    };
  }, [open, branchId, condition]);

  const waitingForSerials = !listsLoaded || (serialsKey !== null && loadedKey !== serialsKey);
  const selectedSet = new Set(selected);
  const filteredSerials = serials.filter((serial) => serialMatches(serial, query));
  const pageCount = Math.max(1, Math.ceil(filteredSerials.length / SERIAL_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * SERIAL_PAGE_SIZE;
  const visibleSerials = filteredSerials.slice(pageStart, pageStart + SERIAL_PAGE_SIZE);
  const selectedMatching = filteredSerials.filter((serial) =>
    selectedSet.has(serial.serialNumberId),
  ).length;
  const allMatchingSelected = filteredSerials.length > 0 && selectedMatching === filteredSerials.length;
  const ready =
    condition !== null && selected.length > 0 && checklistReady(condition, selected, choices);
  const selectedSerials = serials.filter((serial) => selectedSet.has(serial.serialNumberId));
  const createdBy = currentUserName.trim() || "—";
  const createdOn = MANILA_DATE.format(new Date());

  function toggleSerial(serialNumberId: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? current.includes(serialNumberId)
          ? current
          : [...current, serialNumberId]
        : current.filter((id) => id !== serialNumberId),
    );
  }

  function toggleChecklistId(
    serialNumberId: string,
    field: ChecklistField,
    id: string,
    checked: boolean,
  ) {
    setChoices((current) => {
      const choice = choiceFor(current, serialNumberId);
      const currentIds = choice[field];
      const nextIds = checked
        ? currentIds.includes(id)
          ? currentIds
          : [...currentIds, id]
        : currentIds.filter((value) => value !== id);
      return {
        ...current,
        [serialNumberId]: { ...choice, [field]: nextIds },
      };
    });
  }

  function toggleAll(checked: boolean) {
    const matchingIds = new Set(
      serials.filter((serial) => serialMatches(serial, query)).map((serial) => serial.serialNumberId),
    );
    setSelected((current) => {
      if (!checked) return current.filter((id) => !matchingIds.has(id));
      const next = new Set(current);
      for (const id of matchingIds) next.add(id);
      return [...next];
    });
  }

  function setRemarks(serialNumberId: string, remarks: string) {
    setChoices((current) => ({
      ...current,
      [serialNumberId]: { ...choiceFor(current, serialNumberId), remarks },
    }));
  }

  function resetUnits() {
    setSelected([]);
    setChoices({});
    setQuery("");
    setPage(1);
  }

  function resetForm() {
    setCondition(null);
    setLoadedKey(null);
    setFiles([]);
    resetUnits();
  }

  function close() {
    if (pending) return;
    resetForm();
    onOpenChange(false);
  }

  function changeCondition() {
    setCondition(null);
    setLoadedKey(null);
    resetUnits();
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])];
    event.target.value = "";
    const next = [...files];
    for (const file of picked) {
      const refused = pulloutAttachmentError({
        mimeType: file.type,
        sizeBytes: file.size,
        attachedCount: next.length,
      });
      if (refused) {
        toast.error(`${file.name}: ${refused}`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  }

  function submit() {
    if (!condition || !checklistReady(condition, selected, choices)) return;
    startTransition(async () => {
      const result = await onSubmit({
        branchId,
        warehouseId,
        condition,
        lines: selected.map((serialNumberId) => {
          const choice = choiceFor(choices, serialNumberId);
          return {
            serialNumberId,
            pulloutClassificationIds: condition === "STK" ? choice.pulloutClassificationIds : [],
            unitPackingConditionIds: choice.unitPackingConditionIds,
            accessoryCompletenessIds: choice.accessoryCompletenessIds,
            remarks: choice.remarks,
          };
        }),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.pulloutNo ? `Pull-out ${result.pulloutNo} submitted` : "Pull-out submitted",
      );
      const attachError = result.id ? await uploadAttachments(result.id, files) : null;
      if (attachError) {
        toast.error(`The pull-out was saved, but a file was not attached. ${attachError}`);
      }
      resetForm();
      onOpenChange(false);
      onCreated();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl sm:p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
          <DialogTitle>New pull-out</DialogTitle>
          <DialogDescription>
            {condition === null
              ? "What are you pulling out?"
              : condition === "STK"
                ? "Stock units are reserved until the Team Lead decides."
                : "Defective units stay defective until the pull-out is sent."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
          {condition === null ? (
            <ConditionPrompt onChoose={setCondition} />
          ) : (
            <form
              id={PULLOUT_CREATE_FORM_ID}
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <section className="space-y-3">
                <h3 className="font-medium">Requestor</h3>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Field label="Pull-out No.">
                    <span className="text-muted-foreground">Assigned when you submit</span>
                  </Field>
                  <Field label="Branch Name" htmlFor="pullout-branch">
                    <SearchableSelect
                      id="pullout-branch"
                      options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
                      value={branchId}
                      onChange={setBranchId}
                      placeholder="Select branch…"
                      searchPlaceholder="Search branches…"
                      disabled={pending}
                      popoverClassName={POPOVER_CLASS}
                    />
                  </Field>
                  <Field label="Created By">{createdBy}</Field>
                  <Field label="Status">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusCodeBadge code={condition} name={condition} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={changeCondition}
                      >
                        Change
                      </Button>
                    </div>
                  </Field>
                  <Field label="Created Date">{createdOn}</Field>
                  <Field label="Pull-out Status">New</Field>
                  <Field label="Destination warehouse" htmlFor="pullout-warehouse">
                    <SearchableSelect
                      id="pullout-warehouse"
                      options={warehouses.map((warehouse) => ({
                        id: warehouse.id,
                        label: `${warehouse.name} (${warehouse.code})`,
                      }))}
                      value={warehouseId}
                      onChange={setWarehouseId}
                      placeholder="Select warehouse…"
                      searchPlaceholder="Search warehouses…"
                      disabled={pending}
                      popoverClassName={POPOVER_CLASS}
                    />
                  </Field>
                  <Field label="Attachments" htmlFor="pullout-attachments" wide>
                    <div className="space-y-2 pt-1">
                      <Input
                        id="pullout-attachments"
                        type="file"
                        multiple
                        accept={PULLOUT_ATTACHMENT_ACCEPT}
                        disabled={pending || files.length >= PULLOUT_ATTACHMENT_MAX_FILES}
                        onChange={addFiles}
                      />
                      <p className="text-xs text-muted-foreground">
                        Up to {PULLOUT_ATTACHMENT_MAX_FILES} PDF or image files, 4 MB each.
                      </p>
                      {files.length > 0 ? (
                        <ul className="space-y-1">
                          {files.map((file, index) => (
                            <li
                              key={`${file.name}-${index}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 truncate">{file.name}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                aria-label={`Remove ${file.name}`}
                                onClick={() =>
                                  setFiles((current) => current.filter((_, at) => at !== index))
                                }
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </Field>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Select units</h3>
                <Input
                  id="pullout-serial-search"
                  value={query}
                  disabled={pending || waitingForSerials}
                  placeholder="Search model code, model name, or serial number"
                  aria-label="Search model code, model name, or serial number"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
                <div className="min-w-0 overflow-hidden rounded-md border">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th
                          className="w-10 px-2 py-2 align-middle font-medium text-muted-foreground"
                          scope="col"
                        >
                          #
                        </th>
                        <th className="w-10 px-2 py-2 align-middle" scope="col">
                          <Checkbox
                            checked={
                              allMatchingSelected || (selectedMatching > 0 ? "indeterminate" : false)
                            }
                            onCheckedChange={(checked) => toggleAll(checked === true)}
                            disabled={pending || waitingForSerials || filteredSerials.length === 0}
                            aria-label={
                              query.trim()
                                ? "Select all serials matching the search"
                                : "Select all serials"
                            }
                          />
                        </th>
                        <th className="px-2 py-2 align-middle font-medium text-muted-foreground" scope="col">
                          Model
                        </th>
                        <th className="px-2 py-2 align-middle font-medium text-muted-foreground" scope="col">
                          Serial number
                        </th>
                        <th className="w-20 px-2 py-2 align-middle font-medium text-muted-foreground" scope="col">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitingForSerials ? (
                        <tr className="border-t">
                          <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                            Loading serials…
                          </td>
                        </tr>
                      ) : serials.length === 0 ? (
                        <tr className="border-t">
                          <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                            {`No ${condition} serials are free at this branch.`}
                          </td>
                        </tr>
                      ) : filteredSerials.length === 0 ? (
                        <tr className="border-t">
                          <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                            No serials match this search.
                          </td>
                        </tr>
                      ) : (
                        visibleSerials.map((serial, index) => (
                          <tr key={serial.serialNumberId} className="border-t">
                            <td className="px-2 py-2 align-middle tabular-nums text-muted-foreground">
                              {pageStart + index + 1}
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <Checkbox
                                checked={selectedSet.has(serial.serialNumberId)}
                                onCheckedChange={(value) =>
                                  toggleSerial(serial.serialNumberId, value === true)
                                }
                                disabled={pending}
                                aria-label={`Select ${serial.serialNo}`}
                              />
                            </td>
                            <td className="min-w-0 overflow-hidden px-2 py-2 align-middle">
                              <ModelCell skuCode={serial.skuCode} name={serial.modelName} />
                            </td>
                            <td
                              className="min-w-0 overflow-hidden px-2 py-2 align-middle font-mono"
                              title={serial.serialNo}
                            >
                              <span className="block truncate">{serial.serialNo}</span>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <StatusCodeBadge
                                code={serial.inventoryCode}
                                name={serial.inventoryCode}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredSerials.length > 0 ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <p className="text-muted-foreground">
                      {pageStart + 1}–{pageStart + visibleSerials.length} of {filteredSerials.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending || currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending || currentPage >= pageCount}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>

              {selectedSerials.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Transfer details</h3>
                  <div className="min-w-0 overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[60rem] text-sm">
                      <thead className="bg-muted/40 text-left">
                        <tr className="text-muted-foreground">
                          <th className="px-2 py-2 font-medium" scope="col">
                            Model
                          </th>
                          <th className="px-2 py-2 font-medium" scope="col">
                            Serial number
                          </th>
                          <th className="px-2 py-2 font-medium" scope="col">
                            Status
                          </th>
                          {condition === "STK" ? (
                            <th className="px-2 py-2 font-medium" scope="col">
                              Classification
                            </th>
                          ) : null}
                          <th className="px-2 py-2 font-medium" scope="col">
                            Unit packing condition
                          </th>
                          <th className="px-2 py-2 font-medium" scope="col">
                            Acc completeness
                          </th>
                          <th className="px-2 py-2 font-medium" scope="col">
                            Remarks
                          </th>
                          <th className="px-2 py-2 font-medium" scope="col">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSerials.map((serial) => {
                          const choice = choiceFor(choices, serial.serialNumberId);
                          const checklistCell = (
                            label: string,
                            field: ChecklistField,
                            options: { id: string; name: string }[],
                          ) => (
                            <td className="px-2 py-2 align-top">
                              <ChecklistGroup
                                label={`${label} for ${serial.serialNo}`}
                                options={options}
                                selectedIds={choice[field]}
                                disabled={pending}
                                onToggle={(id, checked) =>
                                  toggleChecklistId(serial.serialNumberId, field, id, checked)
                                }
                              />
                            </td>
                          );
                          return (
                            <tr key={serial.serialNumberId} className="border-t">
                              <td className="max-w-44 px-2 py-2 align-top">
                                <ModelCell skuCode={serial.skuCode} name={serial.modelName} />
                              </td>
                              <td className="px-2 py-2 align-top font-mono">{serial.serialNo}</td>
                              <td className="px-2 py-2 align-top">
                                <StatusCodeBadge
                                  code={serial.inventoryCode}
                                  name={serial.inventoryCode}
                                />
                              </td>
                              {condition === "STK"
                                ? checklistCell(
                                    "Classification",
                                    "pulloutClassificationIds",
                                    checklistOptions.classifications,
                                  )
                                : null}
                              {checklistCell(
                                "Unit packing condition",
                                "unitPackingConditionIds",
                                checklistOptions.unitPackingConditions,
                              )}
                              {checklistCell(
                                "Acc completeness",
                                "accessoryCompletenessIds",
                                checklistOptions.accessoryCompleteness,
                              )}
                              <td className="w-48 px-2 py-2 align-top">
                                <Input
                                  value={choice.remarks}
                                  maxLength={PULLOUT_LINE_REMARKS_MAX}
                                  disabled={pending}
                                  aria-label={`Remarks for ${serial.serialNo}`}
                                  onChange={(event) =>
                                    setRemarks(serial.serialNumberId, event.target.value)
                                  }
                                />
                              </td>
                              <td className="px-2 py-2 align-top">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={pending}
                                  aria-label={`Delete ${serial.serialNo}`}
                                  onClick={() => toggleSerial(serial.serialNumberId, false)}
                                >
                                  Delete
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!ready ? (
                    <p className="text-sm text-muted-foreground">
                      {condition === "STK"
                        ? "Choose classification, unit packing condition, and acc completeness for every unit."
                        : "Choose unit packing condition and acc completeness for every unit."}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </form>
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
          {condition !== null ? (
            <Button
              type="submit"
              form={PULLOUT_CREATE_FORM_ID}
              disabled={pending || !ready || !branchId || !warehouseId}
            >
              Submit
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
