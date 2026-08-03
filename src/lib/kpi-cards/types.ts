import type { ReactNode } from "react";

/** Visual emphasis for alert-style KPI cards. */
export type KpiCardTone = "neutral" | "info" | "warning" | "danger";

/** One card in a KPI strip. */
export interface KpiCardItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
  /** When set, the card navigates on click. */
  href?: string;
  /** Optional leading icon (e.g. Lucide). */
  icon?: ReactNode;
  /** Subtle severity styling for alert metrics. */
  tone?: KpiCardTone;
  /** Short subtitle under the value. */
  hint?: ReactNode;
}

/** Status breakdown row shared by the inventory, orders, P-Count and serial number KPI services. */
export interface KpiStatusCount {
  code: string;
  name: string;
  count: number;
}
