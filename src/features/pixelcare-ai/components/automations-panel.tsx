"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  confirmProposalAction,
  runAutomationAction,
  saveAutomationAction,
} from "@/features/pixelcare-ai/actions/automation.actions";
import { REMINDER_STATUSES } from "@/features/pixelcare-ai/automations/proposal-lines";
import {
  minutesToTime,
  timeToMinutes,
  WEEKDAY_LABELS,
  type AutomationCardView,
  type AutomationProposalView,
  type AutomationWorkspace,
} from "@/features/pixelcare-ai/automations/view-model";
import { BackToIsms } from "@/features/pixelcare-ai/components/back-to-isms";
import { PixelcareAiFullscreenToggle } from "@/features/pixelcare-ai/components/fullscreen-toggle";

const STATUS_LABELS: Record<(typeof REMINDER_STATUSES)[number], string> = {
  draft: "Draft",
  pending_ps: "Pending PS",
  pending_tl: "Pending TL",
  pending_sp: "Pending SP",
  pending_logistics: "Pending logistics",
};

export function AutomationsPanel(props: { workspace: AutomationWorkspace }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Pixelcare AI Assistant (BETA)</p>
          <h1 className="truncate text-lg font-semibold">Automations</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/internal/ai">Assistant</Link>
          </Button>
          <BackToIsms />
          <PixelcareAiFullscreenToggle />
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Three scheduled helpers. They start off. Preview does not send notifications or create
          orders. Replenishment stays a proposal until you confirm it.
        </p>
        {props.workspace.cards.map((card) => (
          <AutomationCard
            key={card.id || card.template}
            card={card}
            branches={props.workspace.branches}
            users={props.workspace.users}
          />
        ))}
      </div>
    </div>
  );
}

function AutomationCard(props: {
  card: AutomationCardView;
  branches: AutomationWorkspace["branches"];
  users: AutomationWorkspace["users"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(props.card.enabled);
  const [timezone, setTimezone] = useState(props.card.timezone);
  const [time, setTime] = useState(minutesToTime(props.card.timeOfDayMinutes));
  const [weekdays, setWeekdays] = useState<number[]>(props.card.weekdays);
  const [branchIds, setBranchIds] = useState<string[]>(props.card.branchIds);
  const [recipientIds, setRecipientIds] = useState<string[]>(props.card.recipientUserIds);
  const [minSug, setMinSug] = useState(String(props.card.thresholds.minSug ?? 1));
  const [olderThanDays, setOlderThanDays] = useState(
    String(props.card.thresholds.olderThanDays ?? 3),
  );
  const [statuses, setStatuses] = useState<string[]>(
    Array.isArray(props.card.thresholds.statuses)
      ? props.card.thresholds.statuses.filter((status): status is string => typeof status === "string")
      : ["draft", "pending_tl", "pending_sp"],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], id: string, checked: boolean): string[] {
    if (checked) return list.includes(id) ? list : [...list, id];
    return list.filter((item) => item !== id);
  }

  function thresholds(): Record<string, unknown> {
    switch (props.card.template) {
      case "daily_briefing":
        return {};
      case "replenishment_review":
        return { minSug: Number(minSug) };
      case "pending_work_reminder":
        return { olderThanDays: Number(olderThanDays), statuses };
      default: {
        const unreachable: never = props.card.template;
        return unreachable;
      }
    }
  }

  function save(nextEnabled = enabled) {
    const minutes = timeToMinutes(time);
    if (minutes === null) {
      setError("Choose a time between 00:00 and 23:59.");
      return Promise.resolve({ ok: false as const, error: "Invalid time" });
    }
    setError(null);
    setMessage(null);
    return saveAutomationAction({
      automationId: props.card.id,
      enabled: nextEnabled,
      timezone: timezone.trim(),
      timeOfDayMinutes: minutes,
      weekdays,
      branchIds,
      recipientUserIds: recipientIds,
      thresholds: thresholds(),
    });
  }

  function onSave() {
    startTransition(async () => {
      const result = await save();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Saved. This automation stays off until you turn it on.");
      if (enabled) setMessage("Saved.");
      router.refresh();
    });
  }

  function onRun(trigger: "manual" | "preview") {
    startTransition(async () => {
      const saved = await save();
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      const result = await runAutomationAction({ automationId: props.card.id, trigger });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.run.status === "failed") {
        setError(result.run.error ?? "The run failed.");
      } else {
        setMessage(trigger === "preview" ? "Preview finished. No notification was sent." : "Run finished.");
      }
      router.refresh();
    });
  }

  function onConfirm(proposalId: string) {
    startTransition(async () => {
      setError(null);
      const result = await confirmProposalAction(proposalId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        result.result.created
          ? `Order ${result.result.orderNumber ?? ""} created. It was not sent to SAP.`
          : `Already confirmed. Order ${result.result.orderNumber ?? "on file"} was not created again.`,
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{props.card.title}</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">{props.card.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${props.card.id}-enabled`}>{enabled ? "On" : "Off"}</Label>
            <Switch
              id={`${props.card.id}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={pending || !props.card.id}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Timezone</span>
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Time</span>
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Days</legend>
          <div className="flex flex-wrap gap-3">
            {WEEKDAY_LABELS.map((label, index) => (
              <label key={label} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={weekdays.includes(index)}
                  onCheckedChange={(checked) => {
                    setWeekdays((current) =>
                      checked === true
                        ? [...current, index].sort((a, b) => a - b)
                        : current.filter((day) => day !== index),
                    );
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <CheckboxGroup
          title="Branches"
          empty="No branches in your access."
          options={props.branches.map((branch) => ({
            id: branch.id,
            label: branch.sapCode ? `${branch.name} (${branch.sapCode})` : branch.name,
          }))}
          selected={branchIds}
          onToggle={(id, checked) => setBranchIds((current) => toggle(current, id, checked))}
        />

        <CheckboxGroup
          title="Recipients"
          empty="No people in this tenant."
          options={props.users.map((user) => ({
            id: user.id,
            label: user.name ? `${user.name} (${user.email})` : user.email,
          }))}
          selected={recipientIds}
          onToggle={(id, checked) => setRecipientIds((current) => toggle(current, id, checked))}
        />

        {props.card.template === "replenishment_review" ? (
          <label className="block max-w-xs space-y-1 text-sm">
            <span className="font-medium">Minimum SUG</span>
            <Input
              inputMode="numeric"
              value={minSug}
              onChange={(event) => setMinSug(event.target.value)}
            />
          </label>
        ) : null}

        {props.card.template === "pending_work_reminder" ? (
          <div className="space-y-2">
            <label className="block max-w-xs space-y-1 text-sm">
              <span className="font-medium">Older than (days)</span>
              <Input
                inputMode="numeric"
                value={olderThanDays}
                onChange={(event) => setOlderThanDays(event.target.value)}
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Statuses</legend>
              <div className="flex flex-wrap gap-3">
                {REMINDER_STATUSES.map((status) => (
                  <label key={status} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={statuses.includes(status)}
                      onCheckedChange={(checked) => {
                        setStatuses((current) => toggle(current, status, checked === true));
                      }}
                    />
                    {STATUS_LABELS[status]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onSave} disabled={pending || !props.card.id}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onRun("preview")}
            disabled={pending || !props.card.id}
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onRun("manual")}
            disabled={pending || !props.card.id}
          >
            Run now
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        {props.card.template === "replenishment_review" ? (
          <ProposalList proposals={props.card.proposals} pending={pending} onConfirm={onConfirm} />
        ) : null}

        <RunHistory runs={props.card.runs} />
      </CardContent>
    </Card>
  );
}

function CheckboxGroup(props: {
  title: string;
  empty: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{props.title}</legend>
      {props.options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.empty}</p>
      ) : (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
          {props.options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={props.selected.includes(option.id)}
                onCheckedChange={(checked) => props.onToggle(option.id, checked === true)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ProposalList(props: {
  proposals: AutomationProposalView[];
  pending: boolean;
  onConfirm: (proposalId: string) => void;
}) {
  if (props.proposals.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">Proposals</h2>
      {props.proposals.map((proposal) => {
        const lines = readLines(proposal.lines);
        const open = proposal.status === "proposed" && !proposal.orderId;
        return (
          <div key={proposal.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{proposal.branchName}</p>
                <p className="text-xs text-muted-foreground">
                  {open ? "Proposed — not created" : proposal.label}
                  {proposal.orderNumber ? ` · ${proposal.orderNumber}` : ""}
                </p>
              </div>
              {open ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={props.pending}
                  onClick={() => props.onConfirm(proposal.id)}
                >
                  Confirm order
                </Button>
              ) : proposal.orderId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/orders/auto-replenish">Open orders</Link>
                </Button>
              ) : (
                <Badge variant="secondary">{proposal.status}</Badge>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shelf gaps on this proposal.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">SKU</th>
                      <th className="py-1 pr-3 font-medium">Shelf max</th>
                      <th className="py-1 pr-3 font-medium">STK</th>
                      <th className="py-1 pr-3 font-medium">SUG</th>
                      <th className="py-1 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={`${proposal.id}-${line.sku}`} className="border-b last:border-0">
                        <td className="py-1 pr-3">{line.sku}</td>
                        <td className="py-1 pr-3 tabular-nums">{line.shelfMax}</td>
                        <td className="py-1 pr-3 tabular-nums">{line.stk}</td>
                        <td className="py-1 pr-3 tabular-nums">{line.sug}</td>
                        <td className="py-1 text-muted-foreground">
                          {line.exceptions.length > 0 ? line.exceptions.join("; ") : "Shelf max − STK"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RunHistory(props: { runs: AutomationCardView["runs"] }) {
  if (props.runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet.</p>;
  }
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Run history</h2>
      <ul className="space-y-2">
        {props.runs.map((run) => (
          <li key={run.id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                {run.status}
              </Badge>
              <span className="text-muted-foreground">
                {run.trigger} · {new Date(run.startedAt).toLocaleString()}
              </span>
            </div>
            {run.error ? <p className="mt-1 text-destructive">{run.error}</p> : null}
            <RunResult result={run.result} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunResult(props: { result: unknown }) {
  if (!props.result || typeof props.result !== "object") return null;
  const result = props.result as Record<string, unknown>;
  const summary = typeof result.summary === "string" ? result.summary : null;
  const label = typeof result.label === "string" ? result.label : null;
  const note = typeof result.note === "string" ? result.note : null;
  const items = Array.isArray(result.items) ? result.items : [];
  return (
    <div className="mt-1 space-y-1 text-muted-foreground">
      {label ? <p>{label}</p> : null}
      {summary ? <p>{summary}</p> : null}
      {note ? <p>{note}</p> : null}
      {items.length > 0 ? (
        <ul className="list-disc pl-5">
          {items.slice(0, 8).map((item, index) => {
            if (!item || typeof item !== "object") return null;
            const row = item as { orderNumber?: string; statusLabel?: string };
            return (
              <li key={`${row.orderNumber ?? "item"}-${index}`}>
                {row.orderNumber} {row.statusLabel ? `· ${row.statusLabel}` : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function readLines(value: unknown): Array<{
  sku: string;
  shelfMax: number;
  stk: number;
  sug: number;
  exceptions: string[];
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const line = entry as Record<string, unknown>;
    if (typeof line.sku !== "string" || typeof line.sug !== "number") return [];
    return [
      {
        sku: line.sku,
        shelfMax: typeof line.shelfMax === "number" ? line.shelfMax : 0,
        stk: typeof line.stk === "number" ? line.stk : 0,
        sug: line.sug,
        exceptions: Array.isArray(line.exceptions)
          ? line.exceptions.filter((item): item is string => typeof item === "string")
          : [],
      },
    ];
  });
}
