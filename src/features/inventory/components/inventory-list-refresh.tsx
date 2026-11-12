"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export type InventoryStatusSnapshot = {
  code: string;
  name: string;
  color: string | null;
};

/** A serial row changed. Grouped tables keep their own slice cache and must apply this. */
export type InventoryRowMutation =
  | {
      kind: "status";
      inventoryId: string;
      fromCode: string;
      toCode: "STK" | "DU";
      statusCode: InventoryStatusSnapshot;
    }
  | {
      kind: "defect-pending";
      inventoryId: string;
    };

type Listener = (mutation: InventoryRowMutation) => void;

type InventoryListRefreshContextValue = {
  subscribe: (listener: Listener) => () => void;
  notify: (mutation: InventoryRowMutation) => void;
};

const InventoryListRefreshContext = createContext<InventoryListRefreshContextValue | null>(
  null,
);

export function InventoryListRefreshProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const notify = useCallback((mutation: InventoryRowMutation) => {
    for (const listener of listeners.current) {
      listener(mutation);
    }
  }, []);

  const value = useMemo(() => ({ subscribe, notify }), [subscribe, notify]);

  return (
    <InventoryListRefreshContext.Provider value={value}>
      {children}
    </InventoryListRefreshContext.Provider>
  );
}

export function useNotifyInventoryListRefresh(): (mutation: InventoryRowMutation) => void {
  const notify = useContext(InventoryListRefreshContext)?.notify;
  return notify ?? (() => {});
}

/** Latest listener always runs, including one registered by an already-open group. */
export function useInventoryListRefreshSubscription(listener: Listener) {
  const subscribe = useContext(InventoryListRefreshContext)?.subscribe;
  const listenerRef = useRef(listener);

  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((mutation) => {
      listenerRef.current(mutation);
    });
  }, [subscribe]);
}
