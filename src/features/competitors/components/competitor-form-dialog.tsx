"use client";

import { useMemo, useState, useTransition } from "react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

export interface CompetitorFormOption {
  id: string;
  label: string;
}

export interface CompetitorModelOption extends CompetitorFormOption {
  competitorBrandId: string;
  name: string;
}

interface CompetitorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observation?: CompetitorObservationDto | null;
  competitors: CompetitorFormOption[];
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
  competitors,
  brands,
  models,
}: CompetitorFormDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(observation);

  const [competitorId, setCompetitorId] = useState(observation?.competitorId ?? "");
  const [competitorBrandId, setCompetitorBrandId] = useState(
    observation?.competitorBrandId ?? "",
  );
  const [competitorModelId, setCompetitorModelId] = useState(
    observation?.competitorModelId ?? "",
  );
  const [price, setPrice] = useState(
    observation?.price != null ? String(observation.price) : "",
  );
  const [promotion, setPromotion] = useState(observation?.promotion ?? "");
  const [notes, setNotes] = useState(observation?.notes ?? "");
  const [observedAt, setObservedAt] = useState(
    observation
      ? toDateInputValue(observation.observedAt)
      : toDateInputValue(new Date().toISOString()),
  );

  const filteredModels = useMemo(() => {
    if (!competitorBrandId) return models;
    return models.filter((m) => m.competitorBrandId === competitorBrandId);
  }, [models, competitorBrandId]);

  const competitorOptions = useMemo(() => {
    if (!observation?.competitorId) return competitors;
    if (competitors.some((c) => c.id === observation.competitorId)) return competitors;
    return [
      {
        id: observation.competitorId,
        label: `${observation.competitorName} (inactive)`,
      },
      ...competitors,
    ];
  }, [competitors, observation]);

  const brandOptions = useMemo(() => {
    if (!observation?.competitorBrandId) return brands;
    if (brands.some((b) => b.id === observation.competitorBrandId)) return brands;
    return [
      {
        id: observation.competitorBrandId,
        label: `${observation.brandName ?? "Unknown"} (inactive)`,
      },
      ...brands,
    ];
  }, [brands, observation]);

  const modelOptions = useMemo(() => {
    if (!observation?.competitorModelId) return filteredModels;
    if (filteredModels.some((m) => m.id === observation.competitorModelId)) {
      return filteredModels;
    }
    return [
      {
        id: observation.competitorModelId,
        label: `${observation.modelName ?? "Unknown"} (inactive)`,
        competitorBrandId: observation.competitorBrandId ?? "",
        name: observation.modelName ?? "",
      },
      ...filteredModels,
    ];
  }, [filteredModels, observation]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!competitorId) {
      toast.error("Competitor is required");
      return;
    }
    if (!observedAt) {
      toast.error("Observed date is required");
      return;
    }

    const payload = {
      competitorId,
      competitorBrandId: competitorBrandId || null,
      competitorModelId: competitorModelId || null,
      price: price === "" ? null : price,
      promotion: promotion.trim() || null,
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
          <SearchableSelect
            label="Competitor"
            id="competitorId"
            options={competitorOptions.map((c) => ({ id: c.id, label: c.label }))}
            value={competitorId}
            onChange={setCompetitorId}
            placeholder="Select competitor"
            searchPlaceholder="Search competitors…"
            disabled={pending}
          />

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

          <div className="grid gap-4 sm:grid-cols-2">
            <SearchableSelect
              label="Brand (optional)"
              id="competitorBrandId"
              options={brandOptions.map((b) => ({ id: b.id, label: b.label }))}
              value={competitorBrandId}
              onChange={(next) => {
                setCompetitorBrandId(next);
                setCompetitorModelId("");
              }}
              allowClear
              placeholder="—"
              searchPlaceholder="Search brands…"
              disabled={pending}
            />
            <SearchableSelect
              label="Model (optional)"
              id="competitorModelId"
              options={modelOptions.map((m) => ({ id: m.id, label: m.label }))}
              value={competitorModelId}
              onChange={setCompetitorModelId}
              allowClear
              placeholder="—"
              searchPlaceholder="Search models…"
              disabled={pending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="promotion">Promotion (optional)</Label>
              <Input
                id="promotion"
                value={promotion}
                onChange={(e) => setPromotion(e.target.value)}
                maxLength={255}
                placeholder="Promo name or offer"
              />
            </div>
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
