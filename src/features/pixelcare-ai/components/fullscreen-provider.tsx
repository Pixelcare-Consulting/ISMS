"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readPixelcareAiFullscreenPreference,
  writePixelcareAiFullscreenPreference,
} from "@/features/pixelcare-ai/lib/fullscreen-storage";

type PixelcareAiFullscreenContextValue = {
  /** Prefer embedded (ISMS chrome visible). Default false. */
  fullscreen: boolean;
  setFullscreen: (value: boolean) => void;
  toggleFullscreen: () => void;
  /** True after localStorage has been read on the client. */
  hydrated: boolean;
};

const PixelcareAiFullscreenContext =
  createContext<PixelcareAiFullscreenContextValue | null>(null);

export function PixelcareAiFullscreenProvider(props: { children: ReactNode }) {
  // Default embedded so SSR + first paint match FAB / hard-refresh expectation.
  const [fullscreen, setFullscreenState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFullscreenState(readPixelcareAiFullscreenPreference());
    setHydrated(true);
  }, []);

  const setFullscreen = useCallback((value: boolean) => {
    setFullscreenState(value);
    writePixelcareAiFullscreenPreference(value);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFullscreenState((prev) => {
      const next = !prev;
      writePixelcareAiFullscreenPreference(next);
      return next;
    });
  }, []);

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
