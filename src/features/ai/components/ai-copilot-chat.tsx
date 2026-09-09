"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";

import { askCopilotAction } from "@/features/ai/actions/ai.actions";
import { COPILOT_STARTER_QUESTIONS } from "@/features/ai/constants/starter-questions";
import type { CopilotAnswer, CopilotChatMessage } from "@/features/ai/schemas/ai.schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/cn";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  sources?: CopilotAnswer["sources"];
}

function toPayload(turns: ChatTurn[]): CopilotChatMessage[] {
  return turns.slice(-10).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
}

export function AiCopilotChat(props: {
  configured: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  async function askQuestion(question: string) {
    if (!question || pending || !props.configured) return;

    const nextTurns: ChatTurn[] = [...turns, { role: "user", content: question }];
    setTurns(nextTurns);
    setInput("");
    setPending(true);
    setError(null);

    const result = await askCopilotAction({ messages: toPayload(nextTurns) });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTurns([
      ...nextTurns,
      {
        role: "assistant",
        content: result.answer.answer,
        sources: result.answer.sources,
      },
    ]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await askQuestion(input.trim());
  }

  if (!props.configured) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground",
          props.className,
        )}
      >
        ISMS Assist is not connected yet. You can still browse Help & Support, or ask
        your administrator to turn it on.
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", props.className)}>
      <div
        className={cn(
          "min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-card p-3",
          props.compact ? "max-h-72" : "max-h-[28rem]",
        )}
      >
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask how to process a return, create an order, or what to do next for your
              role. Answers come from Help, tutorials, and module guides.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COPILOT_STARTER_QUESTIONS.map((question) => (
                <Button
                  key={question}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-auto max-w-full whitespace-normal text-left font-normal",
                    props.compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs",
                  )}
                  disabled={pending}
                  onClick={() => {
                    void askQuestion(question);
                  }}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, index) => (
            <div
              key={`${turn.role}-${index}`}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                turn.role === "user"
                  ? "ml-6 bg-primary/10 text-foreground"
                  : "mr-6 bg-muted text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.sources && turn.sources.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  {turn.sources.map((source) => (
                    <li key={`${source.title}-${source.href ?? ""}`}>
                      {source.href ? (
                        <Link href={source.href} className="underline-offset-2 hover:underline">
                          {source.title}
                        </Link>
                      ) : (
                        source.title
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        {pending ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Looking through Help…
          </p>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask ISMS how to do something…"
          rows={props.compact ? 2 : 3}
          disabled={pending}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending || !input.trim()}>
            <Send className="size-3.5" />
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}
