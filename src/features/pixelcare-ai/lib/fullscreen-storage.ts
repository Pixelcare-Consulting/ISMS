export const PIXELCARE_AI_FULLSCREEN_STORAGE_KEY = "pixelcare-ai-fullscreen";

export function readPixelcareAiFullscreenPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PIXELCARE_AI_FULLSCREEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePixelcareAiFullscreenPreference(fullscreen: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PIXELCARE_AI_FULLSCREEN_STORAGE_KEY,
      fullscreen ? "1" : "0",
    );
  } catch {
    // Ignore quota / private-mode failures — in-memory state still works.
  }
}
