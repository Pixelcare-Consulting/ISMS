"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteBranchAction } from "@/features/branches/actions/branch.actions";
import { CreateBranchDialog } from "@/app/(app)/settings/branches/_components/create-branch-dialog";
import { EditBranchDialog } from "@/app/(app)/settings/branches/_components/edit-branch-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

interface BranchRow {
  id: string;
  sapCode: string;
  name: string;
  status: string;
  branchArea: { name: string } | null;
}

export function BranchesTable({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(branches);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [deleting, setDeleting] = useState<BranchRow | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(branches);
  }, [branches]);

  const filtered = useMemo(
    () =>
      rows.filter((b) =>
        matchesTableSearch(query, [b.name, b.sapCode, b.branchArea?.name ?? ""]),
      ),
    [rows, query],
  );
  const selection = useTableSelection(filtered.map((branch) => branch.id));

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteBranchAction(deleting.id);
      if (result.error) {
        toast.error("Could not delete branch", {
          description: typeof result.error === "string" ? result.error : undefined,
        });
        return;
      }
      toast.success("Branch removed");
      setRows((currentRows) => currentRows.filter((branch) => branch.id !== deleting.id));
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <TableSearchToolbar value={query} onChange={setQuery} placeholder="Search branches…">
        {selection.selectedCount > 0 ? (
          <Button variant="secondary" onClick={selection.clearSelection}>
            {selection.selectedCount} selected
          </Button>
        ) : null}
        <CreateBranchDialog
          onCreated={(branch) => {
            setRows((currentRows) => [branch, ...currentRows]);
            router.refresh();
          }}
        />
      </TableSearchToolbar>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  aria-label="Select all branches"
                />
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>SAP code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <DataTableEmpty message="No branches found" />
            ) : (
              filtered.map((branch, index) => (
                <TableRow key={branch.id} data-state={selection.isRowSelected(branch.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selection.isRowSelected(branch.id)}
                      onCheckedChange={(checked) => selection.toggleRow(branch.id, checked === true)}
                      aria-label={`Select branch ${branch.name}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-mono text-sm">{branch.sapCode}</TableCell>
                  <TableCell>{branch.name}</TableCell>
                  <TableCell>{branch.branchArea?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                      {branch.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild title="Planogram">
                      <Link href={`/settings/branches/${branch.id}/planogram`}>
                        <LayoutGrid className="size-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(branch)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(branch)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTableScroll>
      {editing ? (
        <EditBranchDialog
          branch={editing}
          open
          onOpenChange={() => setEditing(null)}
          onUpdated={(branch) => {
            setRows((currentRows) =>
              currentRows.map((row) => (row.id === branch.id ? branch : row)),
            );
            router.refresh();
          }}
        />
      ) : null}
      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Delete branch?"
        description={`Remove ${deleting?.name ?? "this branch"}?`}
        onConfirm={handleDelete}
        pending={pending}
      />
    </DataTableShell>
  );
}
