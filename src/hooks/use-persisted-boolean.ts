"use client";

import { useCallback, useSyncExternalStore } from "react";

const listenersByKey = new Map<string, Set<() => void>>();

function subscribeStorageKey(key: string, onStoreChange: () => void) {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(onStoreChange);
  return () => {
    listeners?.delete(onStoreChange);
    if (listeners && listeners.size === 0) {
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

function readBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBooleanPreference(key: string, next: boolean) {
  try {
    window.localStorage.setItem(key, next ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
  emitStorageKey(key);
}

export type PersistedBooleanSetter = (
  next: boolean | ((prev: boolean) => boolean),
) => void;

/** SSR-safe boolean preference backed by localStorage. */
export function usePersistedBoolean(
  storageKey: string,
  defaultValue = false,
): [boolean, PersistedBooleanSetter] {
  const value = useSyncExternalStore(
    (onStoreChange) => subscribeStorageKey(storageKey, onStoreChange),
    () => readBooleanPreference(storageKey, defaultValue),
    () => defaultValue,
  );

  const setValue = useCallback<PersistedBooleanSetter>(
    (next) => {
      const resolved =
        typeof next === "function"
          ? next(readBooleanPreference(storageKey, defaultValue))
          : next;
      writeBooleanPreference(storageKey, resolved);
    },
    [defaultValue, storageKey],
  );

  return [value, setValue];
}
