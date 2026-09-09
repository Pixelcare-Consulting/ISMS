"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

import { generateDashboardBriefingAction } from "@/features/ai/actions/ai.actions";
import type { DashboardBriefing } from "@/features/ai/schemas/ai.schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardBriefingStrip(props: {
  canAssist: boolean;
  configured: boolean;
  initial: DashboardBriefing | null;
}) {
  const [briefing, setBriefing] = useState<DashboardBriefing | null>(props.initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!props.canAssist || !props.configured || props.initial || autoStarted.current) {
      return;
    }
    autoStarted.current = true;
    setPending(true);
    void generateDashboardBriefingAction(false).then((result) => {
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBriefing(result.briefing);
    });
  }, [props.canAssist, props.configured, props.initial]);

  if (!props.canAssist) {
    return null;
  }

  async function refresh() {
    setPending(true);
    setError(null);
    const result = await generateDashboardBriefingAction(true);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBriefing(result.briefing);
  }

  if (!props.configured) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 pt-5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Daily briefing is not connected yet. Your Dashboard cards still work as
            usual. Ask your administrator to turn on ISMS Assist when you are ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-primary" />
            Today&apos;s briefing
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={pending}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {pending && !briefing ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Preparing a short summary from your Dashboard…
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {briefing ? (
          <div className="space-y-2">
            {briefing.sentences.map((sentence) => (
              <p key={sentence} className="text-sm text-muted-foreground">
                {sentence}
              </p>
            ))}
            {briefing.sources.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Sources:{" "}
                {briefing.sources.map((source, index) => (
                  <span key={`${source.href}-${source.title}`}>
                    {index > 0 ? " · " : null}
                    <Link href={source.href} className="underline-offset-2 hover:underline">
                      {source.title}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
