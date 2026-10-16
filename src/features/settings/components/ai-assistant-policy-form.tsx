"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AI_ASSISTANT_CEILINGS,
  type AiAssistantLimits,
} from "@/features/ai/constants/assistant-limits";
import type { AiAssistantPolicyInput } from "@/features/ai/services/assistant-policy.service";
import { updateAiAssistantPolicyAction } from "@/features/settings/actions/company.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const FIELDS: Array<{
  key: keyof AiAssistantLimits;
  label: string;
  hint: string;
}> = [
  {
    key: "maxRequestsPerUser",
    label: "Requests per person",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxRequestsPerUser} in each window`,
  },
  {
    key: "windowSeconds",
    label: "Request window (seconds)",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.windowSeconds}`,
  },
  {
    key: "maxRequestsPerTenant",
    label: "Requests for the company",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxRequestsPerTenant} in the same window`,
  },
  {
    key: "maxUserConcurrency",
    label: "Active requests per person",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxUserConcurrency}`,
  },
  {
    key: "maxTenantConcurrency",
    label: "Active requests for the company",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxTenantConcurrency}`,
  },
  {
    key: "maxOutputTokens",
    label: "Answer length",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxOutputTokens}`,
  },
  {
    key: "maxToolSteps",
    label: "Lookups per question",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxToolSteps}`,
  },
  {
    key: "requestTimeoutMs",
    label: "Time limit (milliseconds)",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.requestTimeoutMs}`,
  },
  {
    key: "maxContextMessages",
    label: "Earlier messages kept",
    hint: `Up to ${AI_ASSISTANT_CEILINGS.maxContextMessages}`,
  },
];

export function AiAssistantPolicyForm(props: {
  initialValues: AiAssistantPolicyInput;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(props.initialValues.enabled);
  const [limits, setLimits] = useState<AiAssistantLimits>({
    maxRequestsPerUser: props.initialValues.maxRequestsPerUser,
    windowSeconds: props.initialValues.windowSeconds,
    maxOutputTokens: props.initialValues.maxOutputTokens,
    maxToolSteps: props.initialValues.maxToolSteps,
    requestTimeoutMs: props.initialValues.requestTimeoutMs,
    maxRequestsPerTenant: props.initialValues.maxRequestsPerTenant,
    maxUserConcurrency: props.initialValues.maxUserConcurrency,
    maxTenantConcurrency: props.initialValues.maxTenantConcurrency,
    maxContextMessages: props.initialValues.maxContextMessages,
  });
  const [pending, startTransition] = useTransition();

  function setLimit(key: keyof AiAssistantLimits, raw: string) {
    const parsed = Number(raw);
    setLimits((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : current[key],
    }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.canEdit) return;
    startTransition(async () => {
      const result = await updateAiAssistantPolicyAction({ enabled, ...limits });
      if (result.error) {
        toast.error("Could not save assistant settings", { description: result.error });
        return;
      }
      toast.success(enabled ? "Assistant turned on" : "Assistant turned off");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="ai-assistant-enabled">Assistant</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Pixelcare AI and ISMS Assist stay off until you turn them on. Limits can
            only be lowered from the built-in maximum.
          </p>
        </div>
        <Switch
          id="ai-assistant-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!props.canEdit || pending}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="space-y-1 text-sm">
            <span className="font-medium">{field.label}</span>
            <Input
              type="number"
              min={1}
              max={AI_ASSISTANT_CEILINGS[field.key]}
              value={limits[field.key]}
              disabled={!props.canEdit || pending}
              onChange={(event) => setLimit(field.key, event.target.value)}
            />
            <span className="text-xs text-muted-foreground">{field.hint}</span>
          </label>
        ))}
      </div>
      {props.canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save assistant settings"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact a company admin to turn the assistant on.
        </p>
      )}
    </form>
  );
}
