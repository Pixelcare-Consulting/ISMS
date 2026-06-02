"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createBranchAction } from "@/features/branches/actions/branch.actions";
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

interface CreateBranchDialogProps {
  onCreated?: (branch: {
    id: string;
    sapCode: string;
    name: string;
    status: string;
    branchArea: { name: string } | null;
  }) => void;
}

export function CreateBranchDialog({ onCreated }: CreateBranchDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBranchAction(fd);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Could not create branch");
        return;
      }
      toast.success("Branch created");
      if (result.branch) {
        onCreated?.({
          id: result.branch.id,
          sapCode: result.branch.sapCode,
          name: result.branch.name,
          status: result.branch.status,
          branchArea: null,
        });
      }
      setOpen(false);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add branch
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add branch</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sapCode">SAP code</Label>
              <Input id="sapCode" name="sapCode" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <input type="hidden" name="status" value="active" />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
