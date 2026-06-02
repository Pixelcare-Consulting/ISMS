"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createReasonStatusCodeAction,
  updateReasonStatusCodeAction,
} from "@/features/reason-status/actions/reason-status.actions";
import { REASON_STATUS_CATEGORY_LABELS } from "@/features/reason-status/constants/defaults";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function StatusSettingsTable({ groups }: { groups: StatusGroupRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<ReasonStatusCategory | null>(
    groups[0]?.category ?? null,
  );
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const activeGroup = useMemo(
    () => groups.find((g) => g.category === expanded),
    [groups, expanded],
  );
  const selection = useTableSelection(activeGroup?.codes.map((code) => code.id) ?? []);

  function toggleCodeStatus(code: StatusCodeRow) {
    const next: LookupRecordStatus = code.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await updateReasonStatusCodeAction(code.id, { recordStatus: next });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(next === "active" ? "Status code activated" : "Status code deactivated");
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
      setNewCode("");
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => (
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
        <DataTableShell>
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">{activeGroup.name}</h3>
            <p className="text-sm text-muted-foreground">
              Tenant-configurable custom codes. System codes cannot be
              deleted; deactivate instead.
            </p>
            {selection.selectedCount > 0 ? (
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
                  {selection.selectedCount} selected
                </Button>
              </div>
            ) : null}
          </div>
          <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                      onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                      aria-label="Select all status codes"
                    />
                  </TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeGroup.codes.map((code, index) => (
                  <TableRow key={code.id} data-state={selection.isRowSelected(code.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selection.isRowSelected(code.id)}
                        onCheckedChange={(checked) => selection.toggleRow(code.id, checked === true)}
                        aria-label={`Select status code ${code.code}`}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          </DataTableScroll>
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
            <Button disabled={pending || !newCode.trim() || !newName.trim()} onClick={addCode}>
              Add code
            </Button>
          </div>
        </DataTableShell>
      ) : null}
    </div>
  );
}
