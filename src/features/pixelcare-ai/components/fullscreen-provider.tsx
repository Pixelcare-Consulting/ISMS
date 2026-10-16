"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { PIXELCARE_AI_FULLSCREEN_STORAGE_KEY } from "@/features/pixelcare-ai/lib/fullscreen-storage";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";

type PixelcareAiFullscreenContextValue = {
  /** Prefer embedded (ISMS chrome visible). Default false. */
  fullscreen: boolean;
  setFullscreen: (value: boolean) => void;
  toggleFullscreen: () => void;
  /** True after the client store is active (SSR snapshot uses the default). */
  hydrated: boolean;
};

const PixelcareAiFullscreenContext =
  createContext<PixelcareAiFullscreenContextValue | null>(null);

function subscribeNoop() {
  return () => undefined;
}

export function PixelcareAiFullscreenProvider(props: { children: ReactNode }) {
  // SSR + first paint stay embedded (false); client snapshot reads localStorage.
  const [fullscreen, setPersistedFullscreen] = usePersistedBoolean(
    PIXELCARE_AI_FULLSCREEN_STORAGE_KEY,
    false,
  );
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const setFullscreen = useCallback(
    (value: boolean) => {
      setPersistedFullscreen(value);
    },
    [setPersistedFullscreen],
  );

  const toggleFullscreen = useCallback(() => {
    setPersistedFullscreen((prev) => !prev);
  }, [setPersistedFullscreen]);

  const value = useMemo(
    () => ({ fullscreen, setFullscreen, toggleFullscreen, hydrated }),
    [fullscreen, setFullscreen, toggleFullscreen, hydrated],
  );

  return (
    <PixelcareAiFullscreenContext.Provider value={value}>
      {props.children}
    </PixelcareAiFullscreenContext.Provider>
  );
}

export function usePixelcareAiFullscreen(): PixelcareAiFullscreenContextValue {
  const ctx = useContext(PixelcareAiFullscreenContext);
  if (!ctx) {
    throw new Error(
      "usePixelcareAiFullscreen must be used within PixelcareAiFullscreenProvider",
    );
  }
  return ctx;
}
