"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { ArrowDown, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/features/pixelcare-ai/components/markdown-message";
import { ResultTable } from "@/features/pixelcare-ai/components/result-table";
import { tableFromToolOutput } from "@/features/pixelcare-ai/lib/tool-result-table";
import { cn } from "@/utils/cn";

/** Stay stuck to bottom while within this many px of the end. */
const NEAR_BOTTOM_PX = 96;

const TOOL_LABELS: Record<string, string> = {
  listPermittedBranches: "Listing your branches…",
  checkBranchStock: "Checking branch stock…",
  explainShelfGaps: "Reviewing shelf gaps…",
  findOrderStatus: "Looking up order status…",
  explainReturns: "Checking returns guidance…",
};

function toolNameFromPartType(type: string): string | null {
  if (!type.startsWith("tool-")) return null;
  return type.slice("tool-".length);
}

function ToolActivity(props: {
  name: string;
  state?: string;
  output?: unknown;
  errorText?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[props.name] ?? `Running ${props.name}…`;
  const isLoading =
    props.state === "input-streaming" ||
    props.state === "input-available" ||
    props.state === "call";
  const structuredTable =
    props.output !== undefined ? tableFromToolOutput(props.name, props.output) : null;

  return (
    <div className="space-y-2.5">
      {structuredTable ? (
        <ResultTable {...structuredTable} className="my-0.5" />
      ) : null}
      <div className="rounded-md border bg-muted/30 text-xs">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
          <span>{label}</span>
          {!isLoading && structuredTable ? (
            <span className="text-muted-foreground">(raw tool data)</span>
          ) : null}
        </button>
        {open ? (
          <pre className="max-h-48 overflow-auto border-t px-2 py-2 font-mono text-[11px] text-muted-foreground">
            {props.errorText
              ? props.errorText
              : JSON.stringify(props.output ?? { state: props.state }, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function messageText(message: UIMessage): string {
  const parts = message.parts ?? [];
  const fromParts = parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? String(part.text) : ""))
    .join("\n")
    .trim();
  if (fromParts) return fromParts;
  const content = (message as { content?: string }).content;
  return typeof content === "string" ? content : "";
}

function isNearBottom(el: HTMLElement): boolean {
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= NEAR_BOTTOM_PX;
}

export function ChatMessages(props: {
  messages: UIMessage[];
  streaming?: boolean;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Fingerprint content growth (tokens, tools, new turns) without deep compares.
  const scrollSignal = useMemo(() => {
    const last = props.messages[props.messages.length - 1];
    const textLen = last ? messageText(last).length : 0;
    const toolCount =
      last?.parts?.filter((part) => String(part.type).startsWith("tool-")).length ?? 0;
    return [
      props.messages.length,
      last?.id ?? "",
      textLen,
      toolCount,
      props.streaming ? "1" : "0",
    ].join(":");
  }, [props.messages, props.streaming]);

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const scroller = scrollerRef.current;
    const bottom = bottomRef.current;
    if (!scroller) return;
    stickToBottomRef.current = true;
    setShowJump(false);
    if (bottom) {
      bottom.scrollIntoView({ behavior, block: "end" });
      return;
    }
    scroller.scrollTo({ top: scroller.scrollHeight, behavior });
  }

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const near = isNearBottom(scroller);
    stickToBottomRef.current = near;
    setShowJump(!near);
  }

  // Stick to bottom on load, new messages, streaming tokens, and tool activity —
  // unless the user has scrolled up to read history.
  useEffect(() => {
    if (!stickToBottomRef.current) {
      setShowJump(true);
      return;
    }
    const scroller = scrollerRef.current;
    const bottom = bottomRef.current;
    if (!scroller) return;
    const behavior: ScrollBehavior = props.streaming ? "auto" : "smooth";
    if (bottom) {
      bottom.scrollIntoView({ behavior, block: "end" });
    } else {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    }
    setShowJump(false);
  }, [scrollSignal, props.streaming]);

  if (props.messages.length === 0) {
    return (
      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6 text-sm text-muted-foreground",
          props.className,
        )}
      >
        Ask about stock, shelf gaps, orders, or returns. Pixelcare AI cannot place
        orders; use Orders → Create order / Analytics. Answers use read-only ISMS
        tools for data you can already access.
      </div>
    );
  }

  return (
    <div className={cn("relative min-h-0 flex-1", props.className)}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4"
      >
        {props.messages.map((message) => {
          const isUser = message.role === "user";
          const text = messageText(message);
          const toolParts = (message.parts ?? []).filter((part) =>
            String(part.type).startsWith("tool-"),
          );

          return (
            <div
              key={message.id}
              className={cn("flex", isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[min(42rem,100%)] space-y-3 rounded-2xl text-sm",
                  isUser
                    ? "bg-primary px-3 py-2 text-primary-foreground"
                    : "bg-muted px-3.5 py-3",
                )}
              >
                {toolParts.map((part, index) => {
                  const name = toolNameFromPartType(String(part.type)) ?? "tool";
                  const state =
                    "state" in part ? String((part as { state?: string }).state) : undefined;
                  const output =
                    "output" in part ? (part as { output?: unknown }).output : undefined;
                  const errorText =
                    "errorText" in part
                      ? String((part as { errorText?: string }).errorText ?? "")
                      : undefined;
                  return (
                    <ToolActivity
                      key={`${message.id}-tool-${index}`}
                      name={name}
                      state={state}
                      output={output}
                      errorText={errorText}
                    />
                  );
                })}
                {text ? (
                  isUser ? (
                    <p className="whitespace-pre-wrap">{text}</p>
                  ) : (
                    <MarkdownMessage content={text} />
                  )
                ) : null}
              </div>
            </div>
          );
        })}
        {props.streaming ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Retrieving data / drafting reply…
          </div>
        ) : null}
        <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
      </div>

      {showJump ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto shadow-md"
            onClick={() => scrollToLatest("smooth")}
          >
            <ArrowDown className="size-3.5" />
            Scroll to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
}
