"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  createFrequencyCodeAction,
  deleteFrequencyCodeAction,
  updateFrequencyCodeAction,
} from "@/features/frequency-codes/actions/frequency-code.actions";
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from "@/features/frequency-codes/constants";
import type { DeliveryFrequencyValue } from "@/features/frequency-codes/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface FrequencyCodeRow {
  id: string;
  code: string;
  frequency: string;
  description: string;
  usedBy: number;
}

interface FrequencyCodesPanelProps {
  codes: FrequencyCodeRow[];
  canEdit: boolean;
}

interface DraftState {
  id: string | null;
  code: string;
  frequency: DeliveryFrequencyValue;
  description: string;
}

const EMPTY_DRAFT: DraftState = {
  id: null,
  code: "",
  frequency: "weekly",
  description: "",
};

export function FrequencyCodesPanel({ codes, canEdit }: FrequencyCodesPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pending, startTransition] = useTransition();

  function startCreate() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function startEdit(row: FrequencyCodeRow) {
    setDraft({
      id: row.id,
      code: row.code,
      frequency: row.frequency as DeliveryFrequencyValue,
      description: row.description,
    });
  }

  function onSave() {
    if (!draft) return;
    if (!draft.code.trim() || !draft.description.trim()) {
      toast.error("Code and description are required");
      return;
    }
    startTransition(async () => {
      const result = draft.id
        ? await updateFrequencyCodeAction({
            id: draft.id,
            code: draft.code,
            frequency: draft.frequency,
            description: draft.description,
          })
        : await createFrequencyCodeAction({
            code: draft.code,
            frequency: draft.frequency,
            description: draft.description,
          });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(draft.id ? "Frequency code updated" : "Frequency code added");
      setDraft(null);
      router.refresh();
    });
  }

  function onDelete(row: FrequencyCodeRow) {
    if (!confirm(`Delete frequency code ${row.code}?`)) return;
    startTransition(async () => {
      const result = await deleteFrequencyCodeAction(row.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Frequency code deleted");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No frequency codes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Frequency</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Branches</th>
                {canEdit ? <th className="py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4 font-medium">{row.code}</td>
                  <td className="py-2 pr-4">
                    {FREQUENCY_LABELS[row.frequency as DeliveryFrequencyValue] ?? row.frequency}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{row.description}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.usedBy}</td>
                  {canEdit ? (
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(row)}
                          disabled={pending}
                          aria-label={`Edit ${row.code}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row)}
                          disabled={pending}
                          aria-label={`Delete ${row.code}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && draft ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {draft.id ? "Edit frequency code" : "New frequency code"}
            </p>
            <Button variant="ghost" size="icon" onClick={() => setDraft(null)} disabled={pending}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fc-code">Code</Label>
              <Input
                id="fc-code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="e.g. F4"
                disabled={pending}
              />
            </div>
            <SearchableSelect
              label="Frequency"
              options={FREQUENCY_OPTIONS}
              value={draft.frequency}
              onChange={(v) => setDraft({ ...draft, frequency: v as DeliveryFrequencyValue })}
              searchPlaceholder="Search frequency…"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fc-desc">Description</Label>
            <Input
              id="fc-desc"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="e.g. Once a week delivery"
              disabled={pending}
            />
          </div>
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : draft.id ? "Save changes" : "Add code"}
          </Button>
        </div>
      ) : canEdit ? (
        <Button variant="outline" onClick={startCreate} disabled={pending}>
          <Plus className="size-4" />
          Add frequency code
        </Button>
      ) : null}
    </div>
  );
}
