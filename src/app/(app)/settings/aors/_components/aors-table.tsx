"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createAorAction, deleteAorAction } from "@/features/aors/actions/aor.actions";
// createAorAction expects FormData
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AorRow {
  id: string;
  user: { name: string | null; email: string };
  branch: { name: string; sapCode: string } | null;
  warehouse: { name: string; code: string } | null;
}

export function AorsTable({
  aors,
  users,
  branches,
}: {
  aors: AorRow[];
  users: { id: string; label: string }[];
  branches: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");

  function assign() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("branchId", branchId);
      const result = await createAorAction(fd);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("AOR assigned");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteAorAction(id);
      toast.success("AOR removed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4 shadow-sm">
        <div>
          <Label>User</Label>
          <select
            className="flex h-9 min-w-[200px] rounded-md border px-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Branch</Label>
          <select
            className="flex h-9 min-w-[200px] rounded-md border px-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={pending || !userId || !branchId} onClick={assign}>
          Assign AOR
        </Button>
      </div>
      <DataTableShell>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {aors.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.user.name ?? a.user.email}</TableCell>
                  <TableCell>
                    {a.branch ? `${a.branch.name} (${a.branch.sapCode})` : "—"}
                  </TableCell>
                  <TableCell>{a.warehouse ? a.warehouse.name : "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => remove(a.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>
    </div>
  );
}
