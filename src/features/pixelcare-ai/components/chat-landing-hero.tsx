"use client";

import { ChatComposer } from "@/features/pixelcare-ai/components/chat-composer";
import { GuidedTaskChips } from "@/features/pixelcare-ai/components/guided-task-chips";
import type { PixelcareAiTaskId } from "@/features/pixelcare-ai/constants/tasks";

/** Shared centered hero used by guided home and empty open chats. */
export function ChatLandingHero(props: {
  providerConfigured: boolean;
  sampleMode: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectTask: (taskId: PixelcareAiTaskId) => void;
  onStop?: () => void;
  disabled?: boolean;
  streaming?: boolean;
  pendingId?: string | null;
  error?: string | null;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-4 py-8 sm:gap-6 sm:py-10">
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

        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {props.title ?? "Where should we begin?"}
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {props.subtitle ?? "Ask about stock, shelf gaps, orders, and returns."}
          </p>
        </div>

        <div className="space-y-3">
          <ChatComposer
            variant="hero"
            value={props.value}
            onChange={props.onChange}
            onSubmit={props.onSubmit}
            onStop={props.onStop}
            streaming={props.streaming}
            disabled={props.disabled}
            placeholder="Ask Pixelcare AI Assistant (BETA)…"
          />

          <GuidedTaskChips
            disabled={props.disabled || props.streaming}
            pendingId={props.pendingId}
            onSelect={props.onSelectTask}
          />

          {props.error ? (
            <p className="text-center text-sm text-destructive">{props.error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
