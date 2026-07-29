import type { ReactNode } from "react";

/** One card in a KPI strip. */
export interface KpiCardItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
}

/** Status breakdown row shared by the inventory, orders, P-Count and serial number KPI services. */
export interface KpiStatusCount {
  code: string;
  name: string;
  count: number;
}
