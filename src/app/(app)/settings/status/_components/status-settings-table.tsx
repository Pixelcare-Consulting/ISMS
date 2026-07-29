"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createReasonStatusCodeAction,
  updateReasonStatusCodeAction,
} from "@/features/reason-status/actions/reason-status.actions";
import { REASON_STATUS_CATEGORY_LABELS } from "@/features/reason-status/constants/defaults";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import type { LookupRecordStatus, ReasonStatusCategory } from "@prisma/client";

interface StatusCodeRow {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  recordStatus: LookupRecordStatus;
}

interface StatusGroupRow {
  id: string;
  category: ReasonStatusCategory;
  name: string;
  codes: StatusCodeRow[];
}

const COL_COUNT = 7;

export function StatusSettingsTable({ groups }: { groups: StatusGroupRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(groups);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<ReasonStatusCategory | null>(
    groups[0]?.category ?? null,
  );
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setRows(groups);
  }, [groups]);

  const activeGroup = useMemo(
    () => rows.find((g) => g.category === expanded),
    [rows, expanded],
  );
  const activeCodes = activeGroup?.codes ?? [];
  const selection = useTableSelection(activeCodes.map((code) => code.id));
  const {
    page,
    setPage,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(activeCodes, {
    pageSize: 10,
    resetKey: expanded ?? "",
  });

  function toggleCodeStatus(code: StatusCodeRow) {
    const next: LookupRecordStatus = code.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await updateReasonStatusCodeAction(code.id, { recordStatus: next });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(next === "active" ? "Status code activated" : "Status code deactivated");
      setRows((currentRows) =>
        currentRows.map((group) => ({
          ...group,
          codes: group.codes.map((entry) =>
            entry.id === code.id ? { ...entry, recordStatus: next } : entry,
          ),
        })),
      );
      router.refresh();
    });
  }

  function addCode() {
    if (!activeGroup || !newCode.trim() || !newName.trim()) return;
    startTransition(async () => {
      const result = await createReasonStatusCodeAction({
        category: activeGroup.category,
        code: newCode.trim(),
        name: newName.trim(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Status code added");
      if (result.code) {
        setRows((currentRows) =>
          currentRows.map((group) =>
            group.category === activeGroup.category
              ? {
                  ...group,
                  codes: [
                    ...group.codes,
                    {
                      id: result.code.id,
                      code: result.code.code,
                      name: result.code.name,
                      sortOrder: result.code.sortOrder,
                      isSystem: result.code.isSystem,
                      recordStatus: result.code.recordStatus,
                    },
                  ],
                }
              : group,
          ),
        );
      }
      setNewCode("");
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {rows.map((group) => (
          <Button
            key={group.category}
            type="button"
            size="sm"
            variant={expanded === group.category ? "default" : "outline"}
            onClick={() => setExpanded(group.category)}
          >
            {REASON_STATUS_CATEGORY_LABELS[group.category]}
          </Button>
        ))}
      </div>

      {activeGroup ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{activeGroup.name}</h2>
          <GlobalDataTable
            stickyHeader
            toolbarLeading={
              <>
              <p className="text-sm text-muted-foreground">
                Tenant-configurable custom codes. System codes cannot be deleted;
                deactivate instead.
              </p>
              <TableSelectionBadge
                count={selection.selectedCount}
                onClear={selection.clearSelection}
                size="sm"
              />
              </>
            }
            footer={
              <div className="flex flex-wrap items-end gap-2 border-t px-4 py-3">
                <div>
                  <Label htmlFor="new-code">Code</Label>
                  <Input
                    id="new-code"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="e.g. RTN"
                    className="w-28"
                  />
                </div>
                <div>
                  <Label htmlFor="new-name">Name</Label>
                  <Input
                    id="new-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Display label"
                    className="min-w-[200px]"
                  />
                </div>
                <Button
                  disabled={pending || !newCode.trim() || !newName.trim()}
                  onClick={addCode}
                >
                  Add code
                </Button>
              </div>
            }
            pagination={{
              total,
              page,
              totalPages,
              itemLabel: "code",
              onPageChange: setPage,
            }}
          >
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableSelectAllCheckbox
                    isAllSelected={selection.isAllSelected}
                    isPartiallySelected={selection.isPartiallySelected}
                    onToggleAll={selection.toggleAll}
                    aria-label="Select all status codes"
                  />
                  <TableIndexHead />
                  <GlobalTableHead>Code</GlobalTableHead>
                  <GlobalTableHead>Name</GlobalTableHead>
                  <GlobalTableHead>Type</GlobalTableHead>
                  <GlobalTableHead>Status</GlobalTableHead>
                  <GlobalTableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCodes.length === 0 ? (
                  <TableEmptyRow
                    colSpan={COL_COUNT}
                    message="No status codes in this category yet."
                  />
                ) : (
                  pageItems.map((code, index) => (
                    <TableRow
                      key={code.id}
                      data-state={selection.isRowSelected(code.id) ? "selected" : undefined}
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableRowCheckbox
                        checked={selection.isRowSelected(code.id)}
                        onCheckedChange={(checked) => selection.toggleRow(code.id, checked)}
                        aria-label={`Select status code ${code.code}`}
                      />
                      <TableIndexCell index={indexOffset + index + 1} />
                      <TableCell className="font-mono text-sm">{code.code}</TableCell>
                      <TableCell>{code.name}</TableCell>
                      <TableCell>
                        {code.isSystem ? (
                          <Badge variant="secondary">System</Badge>
                        ) : (
                          <Badge variant="outline">Custom</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusCodeBadge
                          code={code.code}
                          name={code.recordStatus === "active" ? "Active" : "Inactive"}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => toggleCodeStatus(code)}
                        >
                          {code.recordStatus === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
          </GlobalDataTable>
        </div>
      ) : null}
    </div>
  );
}
