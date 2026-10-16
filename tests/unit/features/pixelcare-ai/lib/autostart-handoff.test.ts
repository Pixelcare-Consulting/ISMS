/**
 * @jest-environment jsdom
 */

import {
  clearAutostartArtifacts,
  clearAutostartQueue,
  clearAutostartSession,
  clearAutostartUrlParams,
  resolveAutostartPrompt,
  starterPromptFromTaskId,
  writeAutostartHandoff,
} from "@/features/pixelcare-ai/lib/autostart-handoff";

describe("autostart-handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAutostartQueue("conv-1");
    window.history.replaceState({}, "", "/internal/ai?c=conv-1");
  });

  it("resolves starter prompt from a known task id", () => {
    const prompt = starterPromptFromTaskId("check-branch-stock");
    expect(prompt).toMatch(/branch stock/i);
  });

  it("prefers the in-memory handoff written before navigate", () => {
    writeAutostartHandoff("conv-1", "Help me check branch stock.");
    const prompt = resolveAutostartPrompt({
      conversationId: "conv-1",
      serverAutostart: false,
    });
    expect(prompt).toBe("Help me check branch stock.");
  });

  it("still resolves from memory after URL/storage artifacts are cleared", () => {
    writeAutostartHandoff("conv-1", "Help me track an order.");
    window.history.replaceState(
      {},
      "",
      "/internal/ai?c=conv-1&autostart=1&task=track-order",
    );
    clearAutostartArtifacts("conv-1");
    expect(window.location.search).not.toContain("autostart");
    expect(sessionStorage.getItem("pixelcare-ai:autostart:conv-1")).toBeNull();

    const prompt = resolveAutostartPrompt({
      conversationId: "conv-1",
      serverAutostart: false,
    });
    expect(prompt).toBe("Help me track an order.");
  });

  it("falls back to URL task when no handoff was written", () => {
    clearAutostartQueue("conv-1");
    window.history.replaceState(
      {},
      "",
      "/internal/ai?c=conv-1&autostart=1&task=help-return",
    );
    const prompt = resolveAutostartPrompt({
      conversationId: "conv-1",
      serverAutostart: false,
    });
    expect(prompt).toMatch(/return/i);
  });

  it("keeps memory + URL when only session storage is cleared", () => {
    writeAutostartHandoff("conv-1", "Check Monthly SIR for me.");
    window.history.replaceState(
      {},
      "",
      "/internal/ai?c=conv-1&autostart=1&prompt=Check%20Monthly%20SIR%20for%20me.",
    );
    clearAutostartSession("conv-1");
    expect(sessionStorage.getItem("pixelcare-ai:autostart:conv-1")).toBeNull();
    expect(window.location.search).toContain("autostart=1");

    const prompt = resolveAutostartPrompt({
      conversationId: "conv-1",
      serverAutostart: true,
    });
    expect(prompt).toBe("Check Monthly SIR for me.");
  });

  it("strips autostart URL params without clearing the memory queue", () => {
    writeAutostartHandoff("conv-1", "Review shelf gaps.");
    window.history.replaceState(
      {},
      "",
      "/internal/ai?c=conv-1&autostart=1&task=review-shelf-gaps",
    );
    clearAutostartUrlParams();
    expect(window.location.search).not.toContain("autostart");
    expect(window.location.search).toContain("c=conv-1");

    const prompt = resolveAutostartPrompt({
      conversationId: "conv-1",
      serverAutostart: false,
    });
    expect(prompt).toBe("Review shelf gaps.");
  });

  it("resolves free-text from memory when server only has autostart flag", () => {
    writeAutostartHandoff("conv-1", "How many units of model X at Branch A?");
    const prompt = resolveAutostartPrompt({
      conversationId: "conv-1",
      serverAutostart: true,
      serverStarterPrompt: undefined,
    });
    expect(prompt).toBe("How many units of model X at Branch A?");
  });
});
