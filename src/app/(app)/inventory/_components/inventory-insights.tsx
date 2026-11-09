"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getInventoryInsightsAction } from "@/features/inventory/actions/inventory.actions";
import { InventoryKpisStrip } from "@/features/inventory/components/inventory-kpis";
import { InventorySeriesSummaryPanel } from "@/features/inventory/components/inventory-series-summary";
import type {
  InventoryInsights,
  InventorySearchNarrowing,
} from "@/features/inventory/services/inventory.service";

/** URL filters the page already applied server-side (branch, SKU, off-planogram). */
export interface InventoryInsightBaseFilters {
  branchId?: string;
  sku?: string;
  offPlanogram: boolean;
}

type InsightsState = { key: string; insights: InventoryInsights } | { key: string; error: string };

interface InventoryInsightsContextValue {
  insights: InventoryInsights;
  /** True while the search changed and fresh totals are loading. */
  updating: boolean;
  /** True when a search is narrowing the numbers below the URL filters. */
  searching: boolean;
  error: string | null;
  setNarrowing: (narrowing: InventorySearchNarrowing | null) => void;
}

const InventoryInsightsContext = createContext<InventoryInsightsContextValue | null>(null);

const SEARCH_DEBOUNCE_MS = 300;

function narrowingKey(narrowing: InventorySearchNarrowing | null): string {
  return narrowing ? JSON.stringify(narrowing) : "";
}

/**
 * Holds the dashboard cards and Series summary for the Stock units page. With no
 * search they show the server totals; while the table is searched they reload for
 * the rows the search matched.
 */
export function InventoryInsightsProvider({
  initial,
  baseFilters,
  children,
}: {
  initial: InventoryInsights;
  baseFilters: InventoryInsightBaseFilters;
  children: ReactNode;
}) {
  const [narrowing, setNarrowingState] = useState<InventorySearchNarrowing | null>(null);
  const [result, setResult] = useState<InsightsState | null>(null);

  const requestKey = `${JSON.stringify(baseFilters)}|${narrowingKey(narrowing)}`;

  useEffect(() => {
    if (!narrowing) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await getInventoryInsightsAction({ ...baseFilters, ...narrowing });
        if (cancelled) return;
        setResult(
          "error" in response
            ? { key: requestKey, error: response.error ?? "Could not update totals" }
            : { key: requestKey, insights: response.insights },
        );
      } catch {
        if (!cancelled) setResult({ key: requestKey, error: "Could not update totals" });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [baseFilters, narrowing, requestKey]);

  const value = useMemo<InventoryInsightsContextValue>(() => {
    const setNarrowing = (next: InventorySearchNarrowing | null) =>
      setNarrowingState((prev) => (narrowingKey(prev) === narrowingKey(next) ? prev : next));
    if (!narrowing) {
      return { insights: initial, updating: false, searching: false, error: null, setNarrowing };
    }
    const current = result?.key === requestKey ? result : null;
    const lastInsights = result && "insights" in result ? result.insights : initial;
    return {
      insights: current && "insights" in current ? current.insights : lastInsights,
      updating: current === null,
      searching: true,
      error: current && "error" in current ? current.error : null,
      setNarrowing,
    };
  }, [initial, narrowing, requestKey, result]);

  return (
    <InventoryInsightsContext.Provider value={value}>{children}</InventoryInsightsContext.Provider>
  );
}

/**
 * Tables call this with what their search currently matches (null when the
 * search box is empty). Safe outside the provider: it does nothing there.
 */
export function usePublishInventoryNarrowing(narrowing: InventorySearchNarrowing | null) {
  const setNarrowing = useContext(InventoryInsightsContext)?.setNarrowing;
  const key = narrowingKey(narrowing);
  useEffect(() => {
    setNarrowing?.(narrowing);
    // `key` captures the narrowing's content; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setNarrowing]);
  useEffect(() => () => setNarrowing?.(null), [setNarrowing]);
}

function useInventoryInsights(): InventoryInsightsContextValue {
  const value = useContext(InventoryInsightsContext);
  if (!value) throw new Error("Inventory insights rendered outside InventoryInsightsProvider.");
  return value;
}

function SearchStatus() {
  const { searching, updating, error } = useInventoryInsights();
  if (!searching) return null;
  const message = error
    ? `${error}. Showing the last totals.`
    : updating
      ? "Updating cards and Series summary for your search…"
      : "Cards and Series summary match your search.";
  return (
    <p
      className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      role="status"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

export function InventoryInsightsKpis() {
  const { insights, updating } = useInventoryInsights();
  return (
    <div className="space-y-2" aria-busy={updating}>
      <InventoryKpisStrip kpis={insights.kpis} />
      <SearchStatus />
    </div>
  );
}

export function InventoryInsightsSeriesSummary() {
  const { insights, updating } = useInventoryInsights();
  return (
    <div aria-busy={updating}>
      <InventorySeriesSummaryPanel summary={insights.seriesSummary} />
    </div>
  );
}
