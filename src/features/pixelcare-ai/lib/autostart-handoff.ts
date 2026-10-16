import {
  PIXELCARE_AI_TASKS,
  type PixelcareAiTaskId,
} from "@/features/pixelcare-ai/constants/tasks";

const STORAGE_PREFIX = "pixelcare-ai:autostart:";

/**
 * In-memory queue survives sessionStorage clears and React Strict Mode remounts
 * so the second mount can still call sendMessage after the first was aborted.
 */
const queuedPrompts = new Map<string, string>();

function storageKey(conversationId: string): string {
  return `${STORAGE_PREFIX}${conversationId}`;
}

/** Persist starter text so autostart survives URL cleanup / RSC remounts. */
export function writeAutostartHandoff(conversationId: string, prompt: string): void {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  queuedPrompts.set(conversationId, trimmed);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(conversationId), trimmed);
  } catch {
    // Private mode / quota — memory queue + URL params remain.
  }
}

function peekStorage(conversationId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(storageKey(conversationId))?.trim() || null;
  } catch {
    return null;
  }
}

export function starterPromptFromTaskId(taskId: string | null | undefined): string | null {
  const id = taskId?.trim();
  if (!id) return null;
  const task = PIXELCARE_AI_TASKS.find((item) => item.id === (id as PixelcareAiTaskId));
  return task?.starterPrompt?.trim() || null;
}

/**
 * Resolve the prompt that should autostart for this conversation.
 * Prefers in-memory queue, then sessionStorage, then live URL, then server props.
 */
export function resolveAutostartPrompt(input: {
  conversationId: string;
  serverAutostart?: boolean;
  serverStarterPrompt?: string;
}): string | null {
  const fromQueue = queuedPrompts.get(input.conversationId)?.trim();
  if (fromQueue) return fromQueue;

  const fromStorage = peekStorage(input.conversationId);
  if (fromStorage) {
    queuedPrompts.set(input.conversationId, fromStorage);
    return fromStorage;
  }

  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const urlAutostart = url.searchParams.get("autostart") === "1";
    if (urlAutostart) {
      const fromTask = starterPromptFromTaskId(url.searchParams.get("task"));
      if (fromTask) {
        queuedPrompts.set(input.conversationId, fromTask);
        return fromTask;
      }
      const fromPrompt = url.searchParams.get("prompt")?.trim();
      if (fromPrompt) {
        queuedPrompts.set(input.conversationId, fromPrompt);
        return fromPrompt;
      }
    }
  }

  if (input.serverAutostart) {
    const fromServer = input.serverStarterPrompt?.trim();
    if (fromServer) {
      queuedPrompts.set(input.conversationId, fromServer);
      return fromServer;
    }
  }

  return null;
}

/** Drop sessionStorage only — keeps memory queue and leaves the URL alone. */
export function clearAutostartSession(conversationId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(conversationId));
  } catch {
    // ignore
  }
}

/**
 * Strip autostart query params without touching the memory queue.
 * Prefer calling this only after the first user message is visible so a
 * history rewrite cannot cancel an in-flight sendMessage.
 */
export function clearAutostartUrlParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (
    !url.searchParams.has("autostart") &&
    !url.searchParams.has("task") &&
    !url.searchParams.has("prompt")
  ) {
    return;
  }
  url.searchParams.delete("autostart");
  url.searchParams.delete("task");
  url.searchParams.delete("prompt");
  const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}`;
  window.history.replaceState(window.history.state, "", next);
}

/** Keep memory queue; drop durable/url copies so refresh does not double-fire. */
export function clearAutostartArtifacts(conversationId: string): void {
  clearAutostartSession(conversationId);
  clearAutostartUrlParams();
}

export function clearAutostartQueue(conversationId: string): void {
  queuedPrompts.delete(conversationId);
  clearAutostartArtifacts(conversationId);
}
