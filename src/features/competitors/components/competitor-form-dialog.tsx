"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createCompetitorObservationAction,
  updateCompetitorObservationAction,
} from "@/features/competitors/actions/competitor.actions";
import type { CompetitorObservationDto } from "@/features/competitors/services/competitor.service";
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
import { Textarea } from "@/components/ui/textarea";

export interface CompetitorFormOption {
  id: string;
  label: string;
}

export interface CompetitorModelOption extends CompetitorFormOption {
  brandId: string | null;
  skuCode: string;
  name: string;
}

interface CompetitorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observation?: CompetitorObservationDto | null;
  branches: CompetitorFormOption[];
  brands: CompetitorFormOption[];
  models: CompetitorModelOption[];
}

function toDateInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function CompetitorFormDialog({
  open,
  onOpenChange,
  observation,
  branches,
  brands,
  models,
}: CompetitorFormDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(observation);

  const [competitorName, setCompetitorName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [observedAt, setObservedAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setCompetitorName(observation?.competitorName ?? "");
    setBranchId(observation?.branchId ?? "");
    setBrandId(observation?.brandId ?? "");
    setModelId(observation?.modelId ?? "");
    setPrice(observation?.price != null ? String(observation.price) : "");
    setNotes(observation?.notes ?? "");
    setObservedAt(
      observation
        ? toDateInputValue(observation.observedAt)
        : toDateInputValue(new Date().toISOString()),
    );
  }, [open, observation]);

  const filteredModels = useMemo(() => {
    if (!brandId) return models;
    return models.filter((m) => m.brandId === brandId || m.brandId == null);
  }, [models, brandId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!competitorName.trim()) {
      toast.error("Competitor name is required");
      return;
    }
    if (!observedAt) {
      toast.error("Observed date is required");
      return;
    }

    const payload = {
      competitorName: competitorName.trim(),
      branchId: branchId || null,
      brandId: brandId || null,
      modelId: modelId || null,
      price: price === "" ? null : price,
      notes: notes.trim() || null,
      observedAt: new Date(`${observedAt}T12:00:00`),
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateCompetitorObservationAction({ id: observation!.id, ...payload })
        : await createCompetitorObservationAction(payload);

      if (result.error) {
        toast.error(String(result.error));
        return;
      }

      toast.success(isEdit ? "Observation updated" : "Observation created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit observation" : "Add observation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="competitorName">Competitor name</Label>
            <Input
              id="competitorName"
              value={competitorName}
              onChange={(e) => setCompetitorName(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="branchId">Branch (optional)</Label>
              <select
                id="branchId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observedAt">Observed date</Label>
              <Input
                id="observedAt"
                type="date"
                value={observedAt}
                onChange={(e) => setObservedAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brandId">Brand (optional)</Label>
              <select
                id="brandId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  setModelId("");
                }}
              >
                <option value="">—</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelId">Model (optional)</Label>
              <select
                id="modelId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                <option value="">—</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price (optional)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
