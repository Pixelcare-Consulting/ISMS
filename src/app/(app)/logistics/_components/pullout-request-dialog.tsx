"use client";

import { useEffect, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  listBranchesForLogisticsAction,
  listPulloutChecklistOptionsAction,
  listPulloutSerialsAction,
  type PulloutChecklistOptions,
  uploadPulloutAttachmentAction,
} from "@/features/logistics/actions/logistics.actions";
import {
  PULLOUT_ATTACHMENT_ACCEPT,
  PULLOUT_ATTACHMENT_MAX_FILES,
  pulloutAttachmentError,
} from "@/features/logistics/constants/pullout-attachments";
import { pulloutCondition } from "@/features/logistics/services/pullout-posting.planner";
import type {
  PulloutCreateInput,
  PulloutSerialOption,
} from "@/features/logistics/services/pullout-posting.service";
import {
  EMPTY_CHECKLIST_OPTIONS,
  PULLOUT_LINE_FIELDS,
  PulloutLineField,
  pulloutLineChoice,
  pulloutLineComplete,
  pulloutLineInput,
  pulloutMissingDetailsText,
  type PulloutLineChoice,
} from "@/app/(app)/logistics/_components/pullout-line-fields";
import { RecordedProblemCell } from "@/app/(app)/logistics/_components/recorded-problem-cell";
import { PulloutConditionBadge } from "@/features/logistics/components/pullout-condition-badge";
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
const UNIT_COLUMN_COUNT = 11;

const MANILA_DATE = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Asia/Manila",
});


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
    serial.serialNo.toLowerCase().includes(needle) ||
    (serial.recordedProblem?.toLowerCase().includes(needle) ?? false)
  );
}

function unitTableMessage(input: {
  branchChosen: boolean;
  loading: boolean;
  serialCount: number;
  matchCount: number;
}): string | null {
  if (!input.branchChosen) return "Select a branch to see its units.";
  if (input.loading) return "Loading serials…";
  if (input.serialCount === 0) return "No serials are free at this branch.";
  if (input.matchCount === 0) return "No serials match this search.";
  return null;
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

function ModelCell({ skuCode, name }: { skuCode: string; name: string }) {
  const title = name ? `${skuCode} — ${name}` : skuCode;
  return (
    <div className="min-w-0" title={title}>
      <p className="truncate">{skuCode}</p>
      {name ? <p className="truncate text-xs text-muted-foreground">{name}</p> : null}
    </div>
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
  const [serials, setSerials] = useState<PulloutSerialOption[]>([]);
  const [loadedBranchId, setLoadedBranchId] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [branchId, setBranchId] = useState("");
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
      listPulloutChecklistOptionsAction(),
    ]).then(([branchRows, checklist]) => {
      if (cancelled) return;
      setBranches(branchRows);
      if (checklist.error) {
        setChecklistOptions(EMPTY_CHECKLIST_OPTIONS);
        toast.error(checklist.error);
      } else {
        setChecklistOptions({
          reasons: checklist.reasons,
          problemDescriptions: checklist.problemDescriptions,
          classifications: checklist.classifications,
          unitPackingConditions: checklist.unitPackingConditions,
          accessoryCompleteness: checklist.accessoryCompleteness,
        });
      }
      setListsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !branchId) return;
    let cancelled = false;
    void listPulloutSerialsAction(branchId).then((result) => {
      if (cancelled) return;
      setLoadedBranchId(branchId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("serials" in result) setSerials(result.serials);
    });
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  const waitingForSerials = Boolean(branchId) && loadedBranchId !== branchId;
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
  const selectedSerials = serials.filter((serial) => selectedSet.has(serial.serialNumberId));
  const missingDetails = selectedSerials.filter(
    (serial) =>
      !pulloutLineComplete(serial.inventoryCode, pulloutLineChoice(choices, serial.serialNumberId)),
  );
  const ready = selectedSerials.length > 0 && missingDetails.length === 0;
  const tableMessage = unitTableMessage({
    branchChosen: Boolean(branchId),
    loading: waitingForSerials,
    serialCount: serials.length,
    matchCount: filteredSerials.length,
  });
  const selectedCondition = pulloutCondition(
    selectedSerials.map((serial) => ({ priorCode: serial.inventoryCode })),
  );
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

  function updateChoice(serialNumberId: string, patch: Partial<PulloutLineChoice>) {
    setChoices((current) => ({
      ...current,
      [serialNumberId]: { ...pulloutLineChoice(current, serialNumberId), ...patch },
    }));
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

  function resetUnits() {
    setSerials([]);
    setSelected([]);
    setChoices({});
    setQuery("");
    setPage(1);
  }

  function resetForm() {
    setLoadedBranchId(null);
    setBranchId("");
    setFiles([]);
    resetUnits();
  }

  function close() {
    if (pending) return;
    resetForm();
    onOpenChange(false);
  }

  function chooseBranch(nextBranchId: string) {
    if (nextBranchId === branchId) return;
    setBranchId(nextBranchId);
    setLoadedBranchId(null);
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
    if (!ready) return;
    startTransition(async () => {
      const result = await onSubmit({
        branchId,
        lines: selectedSerials.map((serial) =>
          pulloutLineInput(
            serial.serialNumberId,
            serial.inventoryCode,
            pulloutLineChoice(choices, serial.serialNumberId),
          ),
        ),
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
            Stock units are reserved until the Team Lead decides. Defective units stay defective
            until the pull-out is sent.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
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
                    onChange={chooseBranch}
                    placeholder={listsLoaded ? "Select branch…" : "Loading branches…"}
                    searchPlaceholder="Search branches…"
                    disabled={pending || !listsLoaded}
                    popoverClassName={POPOVER_CLASS}
                  />
                </Field>
                <Field label="Created By">{createdBy}</Field>
                <Field label="Status">
                  {selectedCondition ? (
                    <PulloutConditionBadge condition={selectedCondition} />
                  ) : (
                    <span className="text-muted-foreground">Follows the selected units</span>
                  )}
                </Field>
                <Field label="Created Date">{createdOn}</Field>
                <Field label="Pull-out Status">New</Field>
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
              <h3 className="font-medium">Transfer details</h3>
              <Input
                id="pullout-serial-search"
                value={query}
                disabled={pending || !branchId || waitingForSerials}
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
              <div className="min-w-0 overflow-x-auto rounded-md border">
                <table className="w-full min-w-[88rem] table-fixed text-sm">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="w-10 px-2 py-2 align-middle font-medium" scope="col">
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
                      <th className="w-44 px-2 py-2 align-middle font-medium" scope="col">
                        Model
                      </th>
                      <th className="w-44 px-2 py-2 align-middle font-medium" scope="col">
                        Serial number
                      </th>
                      <th className="w-16 px-2 py-2 align-middle font-medium" scope="col">
                        Status
                      </th>
                      <th className="w-48 px-2 py-2 align-middle font-medium" scope="col">
                        Problem description
                      </th>
                      {PULLOUT_LINE_FIELDS.map(({ field, header }) => (
                        <th
                          key={field}
                          className={`${field === "remarks" ? "w-32 " : ""}px-2 py-2 align-middle font-medium`}
                          scope="col"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableMessage ? (
                      <tr className="border-t">
                        <td
                          className="px-2 py-3 text-muted-foreground"
                          colSpan={UNIT_COLUMN_COUNT}
                        >
                          {tableMessage}
                        </td>
                      </tr>
                    ) : (
                      visibleSerials.map((serial, index) => {
                        const isSelected = selectedSet.has(serial.serialNumberId);
                        const fieldsDisabled = pending || !isSelected;
                        const choice = pulloutLineChoice(choices, serial.serialNumberId);
                        return (
                          <tr
                            key={serial.serialNumberId}
                            className={isSelected ? "border-t bg-muted/30" : "border-t"}
                          >
                            <td className="px-2 py-2 align-top tabular-nums text-muted-foreground">
                              {pageStart + index + 1}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(value) =>
                                  toggleSerial(serial.serialNumberId, value === true)
                                }
                                disabled={pending}
                                aria-label={`Select ${serial.serialNo}`}
                              />
                            </td>
                            <td className="min-w-0 overflow-hidden px-2 py-2 align-top">
                              <ModelCell skuCode={serial.skuCode} name={serial.modelName} />
                            </td>
                            <td
                              className="min-w-0 overflow-hidden px-2 py-2 align-top font-mono"
                              title={serial.serialNo}
                            >
                              <span className="block truncate">{serial.serialNo}</span>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <StatusCodeBadge
                                code={serial.inventoryCode}
                                name={serial.inventoryCode}
                              />
                            </td>
                            <td className="min-w-0 px-2 py-2 align-top">
                              <RecordedProblemCell problem={serial.recordedProblem} />
                            </td>
                            {PULLOUT_LINE_FIELDS.map(({ field }) => (
                              <td key={field} className="px-2 py-2 align-top">
                                <PulloutLineField
                                  field={field}
                                  serialNumberId={serial.serialNumberId}
                                  serialNo={serial.serialNo}
                                  unitCode={serial.inventoryCode}
                                  options={checklistOptions}
                                  choice={choice}
                                  disabled={fieldsDisabled}
                                  onChange={(patch) => updateChoice(serial.serialNumberId, patch)}
                                />
                              </td>
                            ))}
                          </tr>
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
                    {selectedSerials.length > 0 ? `, ${selectedSerials.length} selected` : ""}
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
              {missingDetails.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {pulloutMissingDetailsText(missingDetails)}
                </p>
              ) : null}
            </section>
          </form>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={PULLOUT_CREATE_FORM_ID}
            disabled={pending || !ready}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
