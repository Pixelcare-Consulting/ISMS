"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ClipboardList,
  LineChart,
  PackageSearch,
  RotateCcw,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackToIsms } from "@/features/pixelcare-ai/components/back-to-isms";
import { PixelcareAiFullscreenToggle } from "@/features/pixelcare-ai/components/fullscreen-toggle";
import {
  PIXELCARE_AI_TASKS,
  type PixelcareAiTaskId,
} from "@/features/pixelcare-ai/constants/tasks";

const TASK_ICONS: Record<PixelcareAiTaskId, typeof Warehouse> = {
  "check-branch-stock": Warehouse,
  "review-shelf-gaps": PackageSearch,
  "track-order": ClipboardList,
  "help-return": RotateCcw,
  "review-planning": LineChart,
};

export function GuidedHome(props: {
  providerConfigured: boolean;
  sampleMode: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startTask(taskId: PixelcareAiTaskId) {
    const task = PIXELCARE_AI_TASKS.find((item) => item.id === taskId);
    if (!task) return;
    setPending(taskId);
    setError(null);
    try {
      const response = await fetch("/api/internal/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
        }),
      });
      const data = (await response.json()) as {
        conversation?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.conversation?.id) {
        throw new Error(data.error ?? "Could not start conversation.");
      }
      // Task id (not full prompt) keeps the URL short; ChatWorkspace resolves
      // the starter string and immediately streams the first user message.
      const params = new URLSearchParams({
        c: data.conversation.id,
        autostart: "1",
        task: task.id,
      });
      router.push(`/internal/ai?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation.");
      setPending(null);
    }
  }

  async function startBlank() {
    setPending("new");
    setError(null);
    try {
      const response = await fetch("/api/internal/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New conversation" }),
      });
      const data = (await response.json()) as {
        conversation?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.conversation?.id) {
        throw new Error(data.error ?? "Could not start conversation.");
      }
      router.push(`/internal/ai?c=${data.conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation.");
      setPending(null);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-8 overflow-y-auto px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackToIsms />
        <PixelcareAiFullscreenToggle />
      </div>
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-muted-foreground">
          Early access
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Pixelcare AI Assistant (BETA)</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Ask about stock, shelf gaps, orders, and returns using read-only ISMS tools.
          Pixelcare AI Assistant (BETA), answers can be wrong — check important info.
        </p>
      </header>

      {!props.providerConfigured ? (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
          AI provider not configured.
          {props.sampleMode
            ? " Sample mode is on — answers are labeled fixtures only."
            : " Set QWEN credentials or enable sample mode for local demos."}
        </div>
      ) : null}

      {props.sampleMode ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Sample mode is on. Live tools stay labeled as sample data and must not be mixed
          with operational decisions.
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Guided tasks
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PIXELCARE_AI_TASKS.map((task) => {
            const Icon = TASK_ICONS[task.id];
            return (
              <button
                key={task.id}
                type="button"
                disabled={pending !== null}
                onClick={() => void startTask(task.id)}
                className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-muted/40 disabled:opacity-60"
              >
                <Icon className="mb-3 size-5 text-primary" />
                <p className="font-medium">{task.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void startBlank()} disabled={pending !== null}>
          Open blank chat
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
