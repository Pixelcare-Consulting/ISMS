"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createDepartmentAction } from "@/features/users/actions/department.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateDepartmentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createDepartmentAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not create department", { description: result.error });
        return;
      }
      toast.success("Department created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add department
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>
              Create a department for organizing users in your organization.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="department-name">Name</Label>
              <Input
                id="department-name"
                name="name"
                placeholder="Compliance"
                required
                maxLength={80}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
