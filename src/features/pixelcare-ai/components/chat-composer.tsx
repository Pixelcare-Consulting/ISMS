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
}) {
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
      <Textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder ?? "Ask Pixelcare AI Assistant (BETA)…"}
        disabled={props.disabled && !props.streaming}
        rows={3}
        className="min-h-[4.5rem] resize-none"
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Enter to send · Shift+Enter for a new line
        </p>
        <Button
          type="submit"
          size="sm"
          disabled={
            props.streaming
              ? false
              : props.disabled || props.value.trim().length === 0
          }
          variant={props.streaming ? "destructive" : "default"}
        >
          {props.streaming ? (
            <>
              <Square className="size-3.5" />
              Stop
            </>
          ) : props.disabled ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Sending
            </>
          ) : (
            <>
              <Send className="size-3.5" />
              Send
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
