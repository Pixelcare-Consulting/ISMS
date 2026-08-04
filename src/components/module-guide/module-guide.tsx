"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Info, type LucideIcon } from "lucide-react";

import { cn } from "@/utils/cn";

export type ModuleGuideTip = {
  label: string;
  icon?: LucideIcon;
};

export type ModuleGuideProps = {
  title: string;
  description: string;
  badge?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  tips?: ModuleGuideTip[];
  defaultOpen?: boolean;
  /** When set, open/closed persists in localStorage */
  storageKey?: string;
  className?: string;
  /** Force closed when this changes (e.g. status tab switch) */
  resetKey?: string;
};

const listenersByKey = new Map<string, Set<() => void>>();

function subscribeStorageKey(key: string, onStoreChange: () => void) {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(onStoreChange);
  return () => {
    listeners!.delete(onStoreChange);
    if (listeners!.size === 0) {
      listenersByKey.delete(key);
    }
  };
}

function emitStorageKey(key: string) {
  const listeners = listenersByKey.get(key);
  if (!listeners) return;
  for (const listener of listeners) {
    listener();
  }
}

function readOpenPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "1" || raw === "true";
  } catch {
    return fallback;
  }
}

function writeOpenPreference(key: string, next: boolean) {
  try {
    window.localStorage.setItem(key, next ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
  emitStorageKey(key);
}

function usePersistedOpen(
  storageKey: string | undefined,
  defaultOpen: boolean,
): [boolean, (next: boolean) => void] {
  const persisted = useSyncExternalStore(
    (onStoreChange) => {
      if (!storageKey) return () => undefined;
      return subscribeStorageKey(storageKey, onStoreChange);
    },
    () =>
      storageKey ? readOpenPreference(storageKey, defaultOpen) : defaultOpen,
    () => defaultOpen,
  );

  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = storageKey ? persisted : localOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (storageKey) {
        writeOpenPreference(storageKey, next);
        return;
      }
      setLocalOpen(next);
    },
    [storageKey],
  );

  return [open, setOpen];
}

export function ModuleGuide({
  title,
  description,
  badge,
  eyebrow = "Module guide",
  icon: Icon = Info,
  tips,
  defaultOpen = false,
  storageKey,
  className,
  resetKey,
}: ModuleGuideProps) {
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);
  const prevResetKey = useRef(resetKey);

  useEffect(() => {
    if (resetKey === undefined) return;
    if (prevResetKey.current === resetKey) return;
    prevResetKey.current = resetKey;
    setOpen(false);
  }, [resetKey, setOpen]);

  function toggle() {
    setOpen(!open);
  }

  function onHeaderKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          open && "border-b border-border/60",
        )}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onHeaderKeyDown}
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {eyebrow}
            </span>
            {badge ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-base font-semibold tracking-tight text-foreground">
            {title}
          </span>
          {!open ? (
            <span className="mt-0.5 line-clamp-1 block text-sm text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {tips && tips.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tips.map((tip) => {
                const TipIcon = tip.icon;
                return (
                  <li
                    key={tip.label}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {TipIcon ? (
                      <TipIcon className="size-3.5 shrink-0" aria-hidden />
                    ) : null}
                    {tip.label}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
