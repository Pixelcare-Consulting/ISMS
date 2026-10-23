"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomDashboardAction,
  updateCustomDashboardDetailsAction,
} from "@/features/custom-dashboards/actions/custom-dashboard.actions";
import {
  CUSTOM_DASHBOARD_VISIBILITIES,
  CUSTOM_DASHBOARD_VISIBILITY_LABELS,
  type CustomDashboardVisibility,
} from "@/features/custom-dashboards/schemas/custom-dashboard.schema";

interface CustomDashboardDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new dashboard. */
  dashboard?: { id: string; name: string; description: string | null; visibility: CustomDashboardVisibility };
}

export function CustomDashboardDetailsDialog({ open, onOpenChange, dashboard }: CustomDashboardDetailsDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(dashboard?.name ?? "");
  const [description, setDescription] = useState(dashboard?.description ?? "");
  const [visibility, setVisibility] = useState<CustomDashboardVisibility>(dashboard?.visibility ?? "PRIVATE");
  const isEdit = Boolean(dashboard);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const details = { name, description: description || undefined, visibility };

    startTransition(async () => {
      if (dashboard) {
        const result = await updateCustomDashboardDetailsAction({ id: dashboard.id, ...details });
        if (!result.success) {
          setError(result.error);
          return;
        }
        toast.success("Dashboard updated");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await createCustomDashboardAction(details);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Dashboard created");
      router.push(`/dashboard/custom/${result.id}/edit`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Dashboard details" : "New dashboard"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename the dashboard or change who can open it."
              : "Name your dashboard. You'll add charts and data in the designer next."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-dashboard-name">Name</Label>
            <Input
              id="custom-dashboard-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-dashboard-description">Description</Label>
            <Textarea
              id="custom-dashboard-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-dashboard-visibility">Who can open it</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as CustomDashboardVisibility)}>
              <SelectTrigger id="custom-dashboard-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_DASHBOARD_VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CUSTOM_DASHBOARD_VISIBILITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Everyone sees only the data their own role and branches allow.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create and open designer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
