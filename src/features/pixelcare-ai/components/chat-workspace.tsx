"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { BackToIsms } from "@/features/pixelcare-ai/components/back-to-isms";
import { ChatComposer } from "@/features/pixelcare-ai/components/chat-composer";
import { ChatMessages } from "@/features/pixelcare-ai/components/chat-messages";
import { ContextBar } from "@/features/pixelcare-ai/components/context-bar";
import {
  ConversationSidebar,
  type ConversationListItem,
} from "@/features/pixelcare-ai/components/conversation-sidebar";
import { PixelcareAiFullscreenToggle } from "@/features/pixelcare-ai/components/fullscreen-toggle";
import { sortConversationListItems } from "@/features/pixelcare-ai/lib/conversation-list-sort";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";

type StoredMessage = {
  id: string;
  role: string;
  content: string;
};

function toUiMessages(rows: StoredMessage[]): UIMessage[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: row.content }],
    }));
}

export function ChatWorkspace(props: {
  conversationId: string;
  initialTitle: string;
  initialMessages: StoredMessage[];
  initialContext: PixelcareAiContext | null;
  conversationList: ConversationListItem[];
  providerConfigured: boolean;
  sampleMode: boolean;
  autostart?: boolean;
  starterPrompt?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState(
    props.autostart ? "" : (props.starterPrompt ?? ""),
  );
  const [draftOnError, setDraftOnError] = useState<string | null>(null);
  const [context, setContext] = useState<PixelcareAiContext | null>(props.initialContext);
  const [list, setList] = useState(props.conversationList);
  const [localError, setLocalError] = useState<string | null>(null);
  const autostartDone = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/internal/ai/chat",
        prepareSendMessagesRequest: ({ messages, body, id }) => ({
          body: {
            ...body,
            id,
            messages,
            conversationId: props.conversationId,
            context,
          },
        }),
      }),
    [props.conversationId, context],
  );

  const { messages, sendMessage, status, stop, error: chatError } = useChat({
    id: props.conversationId,
    messages: toUiMessages(props.initialMessages),
    transport,
  });

  const streaming = status === "streaming" || status === "submitted";
  const error =
    localError ??
    (chatError ? chatError.message || "Chat failed." : null);
  const prevStreaming = useRef(streaming);

  // Guided tasks: land in chat and immediately stream the starter user message.
  useEffect(() => {
    if (!props.autostart || autostartDone.current) return;
    const prompt = props.starterPrompt?.trim();
    if (!prompt || props.initialMessages.length > 0) return;
    autostartDone.current = true;

    // Drop autostart query params without remounting (keeps the in-flight stream).
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("autostart");
      url.searchParams.delete("task");
      url.searchParams.delete("prompt");
      const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}`;
      window.history.replaceState(window.history.state, "", next);
    }

    void sendMessage({ text: prompt }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Chat failed.";
      setLocalError(message);
      setDraftOnError(prompt);
      setInput(prompt);
    });
  }, [
    props.autostart,
    props.starterPrompt,
    props.initialMessages.length,
    sendMessage,
  ]);

  // After a reply finishes, reload context so the Branch control matches tool results.
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = streaming;
    if (!wasStreaming || streaming) return;

    let cancelled = false;
    void fetch(`/api/internal/ai/conversations/${props.conversationId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { conversation?: { contextJson?: unknown } } | null) => {
        if (cancelled || !data) return;
        const raw = data.conversation?.contextJson;
        if (raw == null) {
          setContext(null);
          return;
        }
        if (typeof raw === "object") {
          setContext(raw as PixelcareAiContext);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [streaming, props.conversationId]);

  async function persistContext(next: PixelcareAiContext | null) {
    setContext(next);
    await fetch(`/api/internal/ai/conversations/${props.conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: next }),
    }).catch(() => undefined);
  }

  async function handleNew() {
    const response = await fetch("/api/internal/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New conversation" }),
    });
    const data = (await response.json()) as { conversation?: { id: string } };
    if (data.conversation?.id) {
      router.push(`/internal/ai?c=${data.conversation.id}`);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/internal/ai/conversations/${id}`, { method: "DELETE" });
    setList((prev) => prev.filter((item) => item.id !== id));
    if (id === props.conversationId) {
      router.push("/internal/ai");
    }
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

  function handleSubmit() {
    const text = (draftOnError ?? input).trim();
    if (!text || streaming) return;
    setLocalError(null);
    setDraftOnError(null);
    setInput("");
    void sendMessage({ text }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Chat failed.";
      setLocalError(message);
      setDraftOnError(text);
      setInput(text);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <ConversationSidebar
        items={list}
        activeId={props.conversationId}
        onNew={() => void handleNew()}
        onDelete={(id) => void handleDelete(id)}
        onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Pixelcare AI Assistant (BETA)</p>
            <h1 className="truncate text-lg font-semibold">{props.initialTitle}</h1>
          </div>
          <BackToIsms />
          {/* DO NOT UNCOMMENT <Button asChild variant="ghost" size="sm">
            <Link href="/internal/ai">Guided home</Link>
          </Button> */}
          <PixelcareAiFullscreenToggle />
        </header>

        <div className="shrink-0 space-y-2 border-b px-4 py-2">
          <ContextBar context={context} onChange={(next) => void persistContext(next)} />
          {!props.providerConfigured ? (
            <p className="text-xs text-muted-foreground">AI provider not configured.</p>
          ) : null}
          {props.sampleMode ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Sample mode — labeled fixtures only.
            </p>
          ) : null}
        </div>

        <ChatMessages
          key={props.conversationId}
          messages={messages}
          streaming={streaming}
        />

        <div className="shrink-0 space-y-2 border-t px-4 py-3">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              {error}
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLocalError(null);
                    if (draftOnError) setInput(draftOnError);
                  }}
                >
                  Restore draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setLocalError(null);
                    handleSubmit();
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : null}
          <ChatComposer
            value={draftOnError ?? input}
            onChange={(value) => {
              setDraftOnError(null);
              setInput(value);
            }}
            onSubmit={handleSubmit}
            onStop={() => void stop()}
            streaming={streaming}
            disabled={!props.providerConfigured && !props.sampleMode}
          />
        </div>
      </div>
    </div>
  );
}
