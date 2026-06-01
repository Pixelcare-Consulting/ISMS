"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { updateBranchAction } from "@/features/branches/actions/branch.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditBranchDialogProps {
  branch: { id: string; sapCode: string; name: string; status: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditBranchDialog({ branch, open, onOpenChange }: EditBranchDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("branchId", branch.id);
    startTransition(async () => {
      const result = await updateBranchAction({
        branchId: branch.id,
        sapCode: String(fd.get("sapCode")),
        name: String(fd.get("name")),
        status: (fd.get("status") as "active" | "inactive") || "active",
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Could not update branch");
        return;
      }
      toast.success("Branch updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit branch</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="branchId" value={branch.id} />
          <div className="space-y-2">
            <Label htmlFor="edit-sapCode">SAP code</Label>
            <Input id="edit-sapCode" name="sapCode" defaultValue={branch.sapCode} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" name="name" defaultValue={branch.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              name="status"
              defaultValue={branch.status}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
