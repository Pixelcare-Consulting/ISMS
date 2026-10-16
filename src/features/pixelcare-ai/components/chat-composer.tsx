"use client";

import type { FormEvent } from "react";
import { Loader2, Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/cn";

export function ChatComposer(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  streaming?: boolean;
  placeholder?: string;
  className?: string;
  /** Centered pill-style composer for the empty chat landing. */
  variant?: "default" | "hero";
}) {
  const hero = props.variant === "hero";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (props.streaming) {
      props.onStop?.();
      return;
    }
    props.onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2", props.className)}>
      <p className="text-center text-[11px] leading-snug text-muted-foreground/80">
        Pixelcare AI Assistant (BETA), answers can be wrong — check important info.
      </p>
      <div
        className={cn(
          hero
            ? "rounded-[1.75rem] border bg-card px-3 py-2 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15"
            : "space-y-2",
        )}
      >
        <Textarea
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder ?? "Ask Pixelcare AI Assistant (BETA)…"}
          disabled={props.disabled && !props.streaming}
          rows={hero ? 2 : 3}
          className={cn(
            "min-h-[4.5rem] resize-none",
            hero &&
              "min-h-[3.25rem] border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0",
          )}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (props.streaming) {
                props.onStop?.();
              } else {
                props.onSubmit();
              }
            }
          }}
        />
        <div
          className={cn(
            "flex items-center justify-end gap-2",
            hero ? "px-1 pb-1" : undefined,
          )}
        >
          <Button
            type="submit"
            size={hero ? "icon" : "sm"}
            className={cn(hero && "size-9 shrink-0 rounded-full")}
            disabled={
              props.streaming
                ? false
                : props.disabled || props.value.trim().length === 0
            }
            variant={props.streaming ? "destructive" : "default"}
            aria-label={props.streaming ? "Stop" : "Send"}
          >
            {props.streaming ? (
              hero ? (
                <Square className="size-3.5" />
              ) : (
                <>
                  <Square className="size-3.5" />
                  Stop
                </>
              )
            ) : props.disabled ? (
              hero ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Sending
                </>
              )
            ) : hero ? (
              <Send className="size-3.5" />
            ) : (
              <>
                <Send className="size-3.5" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground sm:text-left">
        Enter to send · Shift+Enter for a new line
      </p>
    </form>
  );
}
