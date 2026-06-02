"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
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
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [deleting, setDeleting] = useState<BranchRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      branches.filter((b) =>
        matchesTableSearch(query, [b.name, b.sapCode, b.branchArea?.name ?? ""]),
      ),
    [branches, query],
  );

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
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <TableSearchToolbar value={query} onChange={setQuery} placeholder="Search branches…">
        <CreateBranchDialog onCreated={() => router.refresh()} />
      </TableSearchToolbar>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
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
              filtered.map((branch) => (
                <TableRow key={branch.id}>
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
          onUpdated={() => router.refresh()}
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
