"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { BackToIsms } from "@/features/pixelcare-ai/components/back-to-isms";
import { ChatLandingHero } from "@/features/pixelcare-ai/components/chat-landing-hero";
import {
  ConversationSidebar,
  type ConversationListItem,
} from "@/features/pixelcare-ai/components/conversation-sidebar";
import { PixelcareAiFullscreenToggle } from "@/features/pixelcare-ai/components/fullscreen-toggle";
import {
  PIXELCARE_AI_TASKS,
  type PixelcareAiTaskId,
} from "@/features/pixelcare-ai/constants/tasks";
import { writeAutostartHandoff } from "@/features/pixelcare-ai/lib/autostart-handoff";
import { sortConversationListItems } from "@/features/pixelcare-ai/lib/conversation-list-sort";

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80) || "New conversation";
}

export function GuidedHome(props: {
  providerConfigured: boolean;
  sampleMode: boolean;
  conversationList?: ConversationListItem[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState(props.conversationList ?? []);

  const busy = pending !== null;
  const chatDisabled = !props.providerConfigured && !props.sampleMode;

  async function createConversation(title: string): Promise<string> {
    const response = await fetch("/api/internal/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = (await response.json()) as {
      conversation?: { id: string };
      error?: string;
    };
    if (!response.ok || !data.conversation?.id) {
      throw new Error(data.error ?? "Could not start conversation.");
    }
    return data.conversation.id;
  }

  function openConversation(id: string, opts: { taskId?: string }) {
    const params = new URLSearchParams({
      c: id,
      autostart: "1",
    });
    if (opts.taskId) {
      params.set("task", opts.taskId);
    }
    // Fresh RSC payload so the new thread appears in the sidebar immediately.
    router.push(`/internal/ai?${params.toString()}`);
    router.refresh();
  }

  async function startTask(taskId: PixelcareAiTaskId) {
    const task = PIXELCARE_AI_TASKS.find((item) => item.id === taskId);
    if (!task || busy) return;
    setPending(taskId);
    setError(null);
    try {
      const id = await createConversation(task.title);
      // Handoff before navigate so ChatWorkspace can stream even if query
      // params are stripped by history cleanup / RSC remount.
      writeAutostartHandoff(id, task.starterPrompt);
      openConversation(id, { taskId: task.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation.");
      setPending(null);
    }
  }

  async function startWithPrompt(text: string) {
    const prompt = text.trim();
    if (!prompt || busy || chatDisabled) return;
    setPending("prompt");
    setError(null);
    try {
      const id = await createConversation(titleFromPrompt(prompt));
      // Keep free-text out of the URL — memory + sessionStorage is the handoff.
      writeAutostartHandoff(id, prompt);
      openConversation(id, {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation.");
      setPending(null);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/internal/ai/conversations/${id}`, { method: "DELETE" });
    setList((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleTogglePin(id: string, pinned: boolean) {
    const previous = list;
    const nextPinnedAt = pinned ? new Date().toISOString() : null;
    setList((prev) =>
      sortConversationListItems(
        prev.map((item) =>
          item.id === id ? { ...item, pinnedAt: nextPinnedAt } : item,
        ),
      ),
    );

    const response = await fetch(`/api/internal/ai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    }).catch(() => null);

    if (!response?.ok) {
      setList(previous);
      return;
    }

    const data = (await response.json().catch(() => null)) as {
      conversation?: { pinnedAt?: string | Date | null };
    } | null;
    const serverPinned = data?.conversation?.pinnedAt;
    if (serverPinned !== undefined) {
      const pinnedAt =
        serverPinned === null
          ? null
          : typeof serverPinned === "string"
            ? serverPinned
            : new Date(serverPinned).toISOString();
      setList((prev) =>
        sortConversationListItems(
          prev.map((item) => (item.id === id ? { ...item, pinnedAt } : item)),
        ),
      );
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <ConversationSidebar
        items={list}
        activeId={null}
        onNew={() => router.push("/internal/ai")}
        onDelete={(id) => void handleDelete(id)}
        onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Early access</p>
            <p className="truncate text-sm font-medium">Pixelcare AI Assistant (BETA)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/internal/ai/automations">Automations</Link>
            </Button>
            <BackToIsms />
            <PixelcareAiFullscreenToggle />
          </div>
        </header>

        <ChatLandingHero
          providerConfigured={props.providerConfigured}
          sampleMode={props.sampleMode}
          value={input}
          onChange={setInput}
          onSubmit={() => void startWithPrompt(input)}
          onSelectTask={(taskId) => void startTask(taskId)}
          disabled={chatDisabled || busy}
          pendingId={pending}
          error={error}
        />
      </div>
    </div>
  );
}
