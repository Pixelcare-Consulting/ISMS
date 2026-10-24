"use client";

import { Fragment, useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import {
  listBranchesForLogisticsAction,
  listPulloutChecklistOptionsAction,
  listPulloutReasonCodesAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
  type PulloutChecklistOptions,
} from "@/features/logistics/actions/logistics.actions";
import type { PulloutSerialOption } from "@/features/logistics/services/pullout-posting.service";
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

type RequestCondition = "STK" | "DEF" | "Mixed";

interface PulloutChecklistChoice {
  pulloutClassificationIds: string[];
  unitPackingConditionIds: string[];
  accessoryCompletenessIds: string[];
}

const EMPTY_CHOICE: PulloutChecklistChoice = {
  pulloutClassificationIds: [],
  unitPackingConditionIds: [],
  accessoryCompletenessIds: [],
};

interface PulloutRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    branchId: string;
    warehouseId: string;
    reasonStatusCodeId: string;
    lines: {
      serialNumberId: string;
      pulloutClassificationIds: string[];
      unitPackingConditionIds: string[];
      accessoryCompletenessIds: string[];
    }[];
  }) => Promise<{ error?: string; pulloutNo?: string }>;
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
  choices: Readonly<Record<string, PulloutChecklistChoice>>,
  serialNumberId: string,
): PulloutChecklistChoice {
  return choices[serialNumberId] ?? EMPTY_CHOICE;
}

function checklistReady(
  selectedIds: readonly string[],
  choices: Readonly<Record<string, PulloutChecklistChoice>>,
): boolean {
  return selectedIds.every((serialNumberId) => {
    const choice = choices[serialNumberId];
    return Boolean(
      choice &&
        choice.pulloutClassificationIds.length > 0 &&
        choice.unitPackingConditionIds.length > 0 &&
        choice.accessoryCompletenessIds.length > 0,
    );
  });
}

function requestCondition(
  serials: PulloutSerialOption[],
  selected: ReadonlySet<string>,
): RequestCondition | null {
  let stock = false;
  let defective = false;
  for (const serial of serials) {
    if (!selected.has(serial.serialNumberId)) continue;
    switch (serial.inventoryCode) {
      case "STK":
        stock = true;
        break;
      case "DEF":
        defective = true;
        break;
      default: {
        const unreachable: never = serial.inventoryCode;
        return unreachable;
      }
    }
  }
  if (stock && defective) return "Mixed";
  if (stock) return "STK";
  if (defective) return "DEF";
  return null;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function RequestConditionBadge({ condition }: { condition: RequestCondition }) {
  switch (condition) {
    case "STK":
      return <StatusCodeBadge code="STK" name="STK" />;
    case "DEF":
      return <StatusCodeBadge code="DEF" name="DEF" />;
    case "Mixed":
      return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-700">
          Mixed
        </span>
      );
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
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
      <legend className="text-sm font-medium">{label}</legend>
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
  const [reasons, setReasons] = useState<
    { id: string; code: string; name: string; color: string | null }[]
  >([]);
  const [serials, setSerials] = useState<PulloutSerialOption[]>([]);
  const [loadedBranchId, setLoadedBranchId] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, PulloutChecklistChoice>>({});
  const [checklistOptions, setChecklistOptions] = useState<PulloutChecklistOptions>(EMPTY_CHECKLIST_OPTIONS);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      listBranchesForLogisticsAction(),
      listWarehousesForLogisticsAction(),
      listPulloutReasonCodesAction(),
      listPulloutChecklistOptionsAction(),
    ]).then(([branchRows, warehouseRows, reasonRows, checklist]) => {
      if (cancelled) return;
      setBranches(branchRows);
      setWarehouses(warehouseRows);
      setReasons(
        reasonRows.map((reason) => ({
          id: reason.id,
          code: reason.code,
          name: reason.name,
          color: reason.color,
        })),
      );
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

  useEffect(() => {
    if (!open || !branchId) return;
    let cancelled = false;
    const requestedBranchId = branchId;
    void listPulloutSerialsAction(requestedBranchId).then((result) => {
      if (cancelled) return;
      setLoadedBranchId(requestedBranchId);
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
  }, [open, branchId]);

  const waitingForSerials = !listsLoaded || (branchId !== "" && loadedBranchId !== branchId);
  const selectedReason = reasons.find((reason) => reason.id === reasonId) ?? null;
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
  const ready = selected.length > 0 && checklistReady(selected, choices);
  const condition = requestCondition(serials, selectedSet);
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
    field: keyof PulloutChecklistChoice,
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

  function submit() {
    if (!checklistReady(selected, choices)) return;
    startTransition(async () => {
      const result = await onSubmit({
        branchId,
        warehouseId,
        reasonStatusCodeId: reasonId,
        lines: selected.map((serialNumberId) => {
          const choice = choiceFor(choices, serialNumberId);
          return {
            serialNumberId,
            pulloutClassificationIds: choice.pulloutClassificationIds,
            unitPackingConditionIds: choice.unitPackingConditionIds,
            accessoryCompletenessIds: choice.accessoryCompletenessIds,
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
      setSelected([]);
      setChoices({});
      setQuery("");
      setPage(1);
      onOpenChange(false);
      onCreated();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setLoadedBranchId(null);
          setReasonId("");
          setSelected([]);
          setChoices({});
          setQuery("");
          setPage(1);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl sm:p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
          <DialogTitle>New pull-out</DialogTitle>
          <DialogDescription>
            Stock units are reserved. Defective units stay defective until the pull-out is sent.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
          <form
            id={PULLOUT_CREATE_FORM_ID}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Pull-out No.">
                <span className="text-muted-foreground">Assigned when you submit</span>
              </Field>
              <Field label="Branch" htmlFor="pullout-branch">
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
              <Field label="Warehouse" htmlFor="pullout-warehouse">
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
              <Field label="Pull-out reason" htmlFor="pullout-reason">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      id="pullout-reason"
                      options={reasons.map((reason) => ({
                        id: reason.id,
                        label: `${reason.name} (${reason.code})`,
                      }))}
                      value={reasonId}
                      onChange={setReasonId}
                      placeholder="Select reason…"
                      searchPlaceholder="Search reasons…"
                      disabled={pending}
                      popoverClassName={POPOVER_CLASS}
                    />
                  </div>
                  {selectedReason ? (
                    <StatusCodeBadge
                      code={selectedReason.code}
                      name={selectedReason.name}
                      color={selectedReason.color}
                    />
                  ) : null}
                </div>
              </Field>
              <Field label="Created by">{createdBy}</Field>
              <Field label="Created date">{createdOn}</Field>
              <Field label="Status">New</Field>
              <Field label="Inventory condition">
                {condition ? (
                  <RequestConditionBadge condition={condition} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
            </dl>

            <section className="space-y-2">
              <h3 className="font-medium">Items</h3>
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
                      <th
                        className="w-28 px-2 py-2 align-middle font-medium whitespace-normal text-muted-foreground"
                        scope="col"
                      >
                        Inventory condition
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
                          No serials are free at this branch.
                        </td>
                      </tr>
                    ) : filteredSerials.length === 0 ? (
                      <tr className="border-t">
                        <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                          No serials match this search.
                        </td>
                      </tr>
                    ) : (
                      visibleSerials.map((serial, index) => {
                        const checked = selectedSet.has(serial.serialNumberId);
                        const choice = choiceFor(choices, serial.serialNumberId);
                        return (
                          <Fragment key={serial.serialNumberId}>
                            <tr className="border-t">
                              <td className="px-2 py-2 align-middle tabular-nums text-muted-foreground">
                                {pageStart + index + 1}
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <Checkbox
                                  checked={checked}
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
                            {checked ? (
                              <tr className="border-t bg-muted/20">
                                <td className="px-2 py-3" colSpan={5}>
                                  <div className="grid gap-3 sm:grid-cols-3">
                                    <ChecklistGroup
                                      label="Classification"
                                      options={checklistOptions.classifications}
                                      selectedIds={choice.pulloutClassificationIds}
                                      disabled={pending}
                                      onToggle={(id, checked) =>
                                        toggleChecklistId(
                                          serial.serialNumberId,
                                          "pulloutClassificationIds",
                                          id,
                                          checked,
                                        )
                                      }
                                    />
                                    <ChecklistGroup
                                      label="Unit packing condition"
                                      options={checklistOptions.unitPackingConditions}
                                      selectedIds={choice.unitPackingConditionIds}
                                      disabled={pending}
                                      onToggle={(id, checked) =>
                                        toggleChecklistId(
                                          serial.serialNumberId,
                                          "unitPackingConditionIds",
                                          id,
                                          checked,
                                        )
                                      }
                                    />
                                    <ChecklistGroup
                                      label="Accessory completeness"
                                      options={checklistOptions.accessoryCompleteness}
                                      selectedIds={choice.accessoryCompletenessIds}
                                      disabled={pending}
                                      onToggle={(id, checked) =>
                                        toggleChecklistId(
                                          serial.serialNumberId,
                                          "accessoryCompletenessIds",
                                          id,
                                          checked,
                                        )
                                      }
                                    />
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
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
              {selected.length > 0 && !ready ? (
                <p className="text-sm text-muted-foreground">
                  Choose classification, unit packing condition, and accessory completeness for every
                  selected serial.
                </p>
              ) : null}
            </section>
          </form>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={PULLOUT_CREATE_FORM_ID}
            disabled={pending || !ready || !branchId || !warehouseId || !reasonId}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
