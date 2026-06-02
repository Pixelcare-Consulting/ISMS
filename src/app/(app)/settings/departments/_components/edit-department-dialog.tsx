"use client";

import { useState, useTransition } from "react";

import { toast } from "sonner";

import { updateDepartmentAction } from "@/features/users/actions/department.actions";
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

interface DepartmentRow {
  id: string;
  name: string;
}

interface EditDepartmentDialogProps {
  department: DepartmentRow | null;
  onClose: () => void;
  onUpdated?: (department: { id: string; name: string }) => void;
}

function EditDepartmentForm({
  department,
  onClose,
  onUpdated,
}: {
  department: DepartmentRow;
  onClose: () => void;
  onUpdated?: (department: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(department.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("departmentId", department.id);

    startTransition(async () => {
      const result = await updateDepartmentAction(formData);
      if (result.error) {
        setError(result.error);
        toast.error("Could not update department", { description: result.error });
        return;
      }
      toast.success("Department updated");
      if (result.department) {
        onUpdated?.(result.department);
      }
      onClose();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-department-name">Name</Label>
        <Input
          id="edit-department-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditDepartmentDialog({
  department,
  onClose,
  onUpdated,
}: EditDepartmentDialogProps) {
  return (
    <Dialog open={!!department} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit department</DialogTitle>
          <DialogDescription>Update the department name.</DialogDescription>
        </DialogHeader>
        {department ? (
          <EditDepartmentForm
            key={department.id}
            department={department}
            onClose={onClose}
            onUpdated={onUpdated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
