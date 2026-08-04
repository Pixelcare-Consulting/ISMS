"use client";

import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  ArrowLeftRight,
  Info,
  Package,
  ShoppingCart,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createReasonStatusCodeAction,
  updateReasonStatusCodeAction,
} from "@/features/reason-status/actions/reason-status.actions";
import { REASON_STATUS_CATEGORY_LABELS } from "@/features/reason-status/constants/defaults";
import {
  resolveStatusColorKey,
  type StatusColorKey,
} from "@/features/reason-status/constants/status-colors";
import {
  RecordStatusBadge,
  StatusCodeBadge,
} from "@/features/reason-status/components/status-code-badge";
import { StatusColorPicker } from "@/features/reason-status/components/status-color-picker";
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
import { ModuleGuide } from "@/components/module-guide";
import { statusModuleGuideForCategory } from "@/content/module-guides/status";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
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
  color: string | null;
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

type OptimisticUpdate =
  | {
      type: "recordStatus";
      codeId: string;
      recordStatus: LookupRecordStatus;
    }
  | { type: "color"; codeId: string; color: string }
  | {
      type: "add";
      category: ReasonStatusCategory;
      code: StatusCodeRow;
    };

function applyOptimisticUpdate(
  current: StatusGroupRow[],
  update: OptimisticUpdate,
): StatusGroupRow[] {
  switch (update.type) {
    case "recordStatus":
      return current.map((group) => ({
        ...group,
        codes: group.codes.map((entry) =>
          entry.id === update.codeId
            ? { ...entry, recordStatus: update.recordStatus }
            : entry,
        ),
      }));
    case "color":
      return current.map((group) => ({
        ...group,
        codes: group.codes.map((entry) =>
          entry.id === update.codeId
            ? { ...entry, color: update.color }
            : entry,
        ),
      }));
    case "add":
      return current.map((group) =>
        group.category === update.category
          ? { ...group, codes: [...group.codes, update.code] }
          : group,
      );
    default: {
      const _exhaustive: never = update;
      return _exhaustive;
    }
  }
}

const COL_COUNT = 9;

const CATEGORY_ICONS: Record<ReasonStatusCategory, LucideIcon> = {
  inventory_system: Package,
  pullout_reason: Undo2,
  delivery_workflow: Truck,
  transfer_workflow: ArrowLeftRight,
  pullout_workflow: Undo2,
  sales_atr: ShoppingCart,
};

export function StatusSettingsTable({ groups }: { groups: StatusGroupRow[] }) {
  const router = useRouter();
  const [rows, applyOptimistic] = useOptimistic(groups, applyOptimisticUpdate);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<ReasonStatusCategory | null>(
    groups[0]?.category ?? null,
  );
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<StatusColorKey>("slate");

  const activeGroup = useMemo(
    () => rows.find((g) => g.category === expanded),
    [rows, expanded],
  );
  const activeCodes = activeGroup?.codes ?? [];
  const selection = useTableSelection(activeCodes.map((code) => code.id));
  const sort = useClientTableSort(activeCodes, {
    code: (code) => code.code,
    name: (code) => code.name,
    color: (code) => resolveStatusColorKey(code.color, code.code),
    type: (code) => (code.isSystem ? "System" : "Custom"),
    record: (code) => code.recordStatus,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${expanded ?? ""}:${sort.sortKey}:${sort.sortDir}`,
  });

  function toggleCodeStatus(code: StatusCodeRow) {
    const next: LookupRecordStatus =
      code.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      applyOptimistic({
        type: "recordStatus",
        codeId: code.id,
        recordStatus: next,
      });
      const result = await updateReasonStatusCodeAction(code.id, {
        recordStatus: next,
      });
      if (result.error) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(
        next === "active" ? "Status code activated" : "Status code deactivated",
      );
      router.refresh();
    });
  }

  function setCodeColor(code: StatusCodeRow, color: StatusColorKey) {
    if (resolveStatusColorKey(code.color, code.code) === color) return;
    startTransition(async () => {
      applyOptimistic({ type: "color", codeId: code.id, color });
      const result = await updateReasonStatusCodeAction(code.id, { color });
      if (result.error) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success("Badge color updated");
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
        color: newColor,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Status code added");
      if (result.code) {
        applyOptimistic({
          type: "add",
          category: activeGroup.category,
          code: {
            id: result.code.id,
            code: result.code.code,
            name: result.code.name,
            color: result.code.color,
            sortOrder: result.code.sortOrder,
            isSystem: result.code.isSystem,
            recordStatus: result.code.recordStatus,
          },
        });
      }
      setNewCode("");
      setNewName("");
      setNewColor("slate");
      router.refresh();
    });
  }
  const CategoryIcon = activeGroup
    ? CATEGORY_ICONS[activeGroup.category]
    : Info;
  const statusGuide = activeGroup
    ? statusModuleGuideForCategory(
        activeGroup.category,
        activeGroup.name,
        activeGroup.codes.length,
      )
    : null;

  return (
    <div className="space-y-4">
      {activeGroup && statusGuide ? (
        <ModuleGuide
          title={statusGuide.title}
          description={statusGuide.description}
          badge={statusGuide.badge}
          icon={CategoryIcon}
          tips={statusGuide.tips.map((tip, index) =>
            index === 0 ? { label: tip.label, icon: Info } : tip,
          )}
          resetKey={activeGroup.category}
        />
      ) : null}

      <div
        className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-sm"
        role="tablist"
        aria-label="Status module"
      >
        {rows.map((group) => (
          <Button
            key={group.category}
            type="button"
            role="tab"
            aria-selected={expanded === group.category}
            size="sm"
            variant={expanded === group.category ? "default" : "ghost"}
            className={cn(
              "rounded-lg",
              expanded !== group.category && "text-muted-foreground",
            )}
            onClick={() => setExpanded(group.category)}
          >
            {REASON_STATUS_CATEGORY_LABELS[group.category]}
          </Button>
        ))}
      </div>

      {activeGroup ? (
        <div className="space-y-4">
          <GlobalDataTable
            stickyHeader
            toolbarLeading={
              <>
                <p className="text-sm text-muted-foreground">
                  Pick a color swatch to change how this status looks in the app.
                </p>
                <TableSelectionBadge
                  count={selection.selectedCount}
                  onClear={selection.clearSelection}
                  size="sm"
                />
              </>
            }
            footer={
              <div className="flex flex-wrap items-end gap-3 border-t px-4 py-3">
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
                    className="min-w-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <StatusColorPicker value={newColor} onChange={setNewColor} />
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
            pageSize={{ value: pageSize, onChange: setPageSize }}
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
                <GlobalTableHead {...sort.sortProps("code")}>Code</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("name")}>Name</GlobalTableHead>
                <GlobalTableHead>Preview</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("color")}>Color</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("type")}>Type</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("record")}>Record</GlobalTableHead>
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
                    data-state={
                      selection.isRowSelected(code.id) ? "selected" : undefined
                    }
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableRowCheckbox
                      checked={selection.isRowSelected(code.id)}
                      onCheckedChange={(checked) =>
                        selection.toggleRow(code.id, checked)
                      }
                      aria-label={`Select status code ${code.code}`}
                    />
                    <TableIndexCell index={indexOffset + index + 1} />
                    <TableCell className="font-mono text-sm">{code.code}</TableCell>
                    <TableCell>{code.name}</TableCell>
                    <TableCell>
                      <StatusCodeBadge
                        code={code.code}
                        name={code.name}
                        color={code.color}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusColorPicker
                        value={resolveStatusColorKey(code.color, code.code)}
                        disabled={pending}
                        onChange={(color) => setCodeColor(code, color)}
                      />
                    </TableCell>
                    <TableCell>
                      {code.isSystem ? (
                        <Badge variant="secondary">System</Badge>
                      ) : (
                        <Badge variant="outline">Custom</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <RecordStatusBadge status={code.recordStatus} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => toggleCodeStatus(code)}
                      >
                        {code.recordStatus === "active"
                          ? "Deactivate"
                          : "Activate"}
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
