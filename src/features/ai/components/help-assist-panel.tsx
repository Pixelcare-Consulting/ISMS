"use client";

import { Sparkles } from "lucide-react";

import { AiCopilotChat } from "@/features/ai/components/ai-copilot-chat";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function HelpAssistPanel(props: { configured: boolean }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="size-5 text-primary" />
          Assist
        </CardTitle>
        <CardDescription>
          Ask how to use ISMS for your role. Answers cite Help, page tutorials, and
          module guides so you can check the original steps.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiCopilotChat configured={props.configured} compact />
      </CardContent>
    </Card>
  );
}
