import { GuidedHome } from "@/features/pixelcare-ai/components/guided-home";
import { ChatWorkspace } from "@/features/pixelcare-ai/components/chat-workspace";
import { PixelcareAiAccessDenied } from "@/features/pixelcare-ai/components/access-denied";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import {
  PIXELCARE_AI_TASKS,
  type PixelcareAiTaskId,
} from "@/features/pixelcare-ai/constants/tasks";
import { resolvePixelcareAiPageAccess } from "@/features/pixelcare-ai/lib/access";
import { isPixelcareAiProviderConfigured } from "@/features/pixelcare-ai/lib/provider";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";
import { conversationService } from "@/features/pixelcare-ai/services/conversation.service";

interface AiPageProps {
  searchParams: Promise<{
    c?: string;
    autostart?: string;
    /** Guided task id — preferred over raw `prompt` for starter text */
    task?: string;
    /** Legacy / fallback starter text */
    prompt?: string;
  }>;
}

function starterPromptFromParams(params: {
  task?: string;
  prompt?: string;
}): string | undefined {
  const taskId = params.task?.trim();
  if (taskId) {
    const task = PIXELCARE_AI_TASKS.find((item) => item.id === (taskId as PixelcareAiTaskId));
    if (task?.starterPrompt) return task.starterPrompt;
  }
  const prompt = params.prompt?.trim();
  return prompt || undefined;
}

function asContext(value: unknown): PixelcareAiContext | null {
  if (!value || typeof value !== "object") return null;
  return value as PixelcareAiContext;
}

export default async function PixelcareAiPage({ searchParams }: AiPageProps) {
  const access = await resolvePixelcareAiPageAccess();
  if (!access.ok) {
    return <PixelcareAiAccessDenied reason={access.reason} />;
  }
  const session = access.session;
  const params = await searchParams;
  const providerConfigured = isPixelcareAiProviderConfigured();
  const sampleMode = isPixelcareAiSampleMode();

  const list = await conversationService.list(
    session.user.tenantId,
    session.user.id,
  );
  const conversationList = list.map((item) => ({
    id: item.id,
    title: item.title,
    updatedAt: item.updatedAt.toISOString(),
    pinnedAt: item.pinnedAt ? item.pinnedAt.toISOString() : null,
  }));

  if (!params.c) {
    return (
      <GuidedHome providerConfigured={providerConfigured} sampleMode={sampleMode} />
    );
  }

  const conversation = await conversationService.getOwned(
    session.user.tenantId,
    session.user.id,
    params.c,
  );

  if (!conversation) {
    return (
      <GuidedHome providerConfigured={providerConfigured} sampleMode={sampleMode} />
    );
  }

  return (
    <ChatWorkspace
      conversationId={conversation.id}
      initialTitle={conversation.title}
      initialMessages={conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      }))}
      initialContext={asContext(conversation.contextJson)}
      conversationList={conversationList}
      providerConfigured={providerConfigured}
      sampleMode={sampleMode}
      autostart={params.autostart === "1"}
      starterPrompt={starterPromptFromParams(params)}
    />
  );
}
