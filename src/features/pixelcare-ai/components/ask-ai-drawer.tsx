"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChatComposer } from "@/features/pixelcare-ai/components/chat-composer";
import { ChatMessages } from "@/features/pixelcare-ai/components/chat-messages";
import { ContextBar } from "@/features/pixelcare-ai/components/context-bar";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";

export function AskAiDrawer(props: {
  pageContext: PixelcareAiContext;
  providerConfigured: boolean;
  sampleMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [context, setContext] = useState<PixelcareAiContext | null>(props.pageContext);
  const [error, setError] = useState<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/internal/ai/chat",
        body: {
          conversationId,
          context: open ? context : props.pageContext,
        },
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const headerId = response.headers.get("x-pixelcare-conversation-id");
          if (headerId) {
            setConversationId(headerId);
          }
          return response;
        },
      }),
    [conversationId, context, open, props.pageContext],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: conversationId ?? "pixelcare-ask-ai-draft",
    transport,
  });

  const streaming = status === "streaming" || status === "submitted";
  const prevStreaming = useRef(streaming);

  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = streaming;
    if (!wasStreaming || streaming || !conversationId) return;
    void fetch(`/api/internal/ai/conversations/${conversationId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { conversation?: { contextJson?: unknown } } | null) => {
        const raw = data?.conversation?.contextJson;
        if (raw == null) {
          setContext(null);
          return;
        }
        if (typeof raw === "object") {
          setContext(raw as PixelcareAiContext);
        }
      })
      .catch(() => undefined);
  }, [streaming, conversationId]);

  async function handleSubmit() {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");
    try {
      await sendMessage({ text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
      setInput(text);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setContext(props.pageContext);
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="fixed bottom-4 right-4 z-40 shadow-md transition-transform duration-200 hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
        >
          <Sparkles className="ai-fab-sparkle-icon size-3.5 text-primary" />
          Ask AI
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>Pixelcare AI Assistant (BETA)</SheetTitle>
          <SheetDescription>
            Ask about this page. Uses the same private assistant as{" "}
            <Link href="/internal/ai" className="underline">
              /internal/ai
            </Link>
            .
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 border-b px-4 py-2">
          <ContextBar context={context} onChange={setContext} />
          {!props.providerConfigured ? (
            <p className="text-xs text-muted-foreground">AI provider not configured.</p>
          ) : null}
          {props.sampleMode ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Sample mode on.</p>
          ) : null}
        </div>

        <ChatMessages messages={messages} streaming={streaming} className="px-2" />

        <div className="mt-auto space-y-2 border-t px-4 py-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMessages([]);
                setConversationId(null);
              }}
            >
              Clear thread
            </Button>
            {conversationId ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/internal/ai?c=${conversationId}`}>Open workspace</Link>
              </Button>
            ) : null}
          </div>
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={() => void handleSubmit()}
            onStop={() => void stop()}
            streaming={streaming}
            disabled={!props.providerConfigured && !props.sampleMode}
            placeholder="Ask about this page…"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
