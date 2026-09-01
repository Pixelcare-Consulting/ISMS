"use client";

import { create } from "zustand";

import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";

export interface SapSyncNoun {
  one: string;
  many: string;
}

export interface SapSyncReport {
  noun: SapSyncNoun;
  result: SapSyncResult;
}

interface SapSyncState {
  /**
   * When each in-flight sync started, keyed by sync key; absent means not running, and
   * any button or badge for that key shows a spinner while it is present.
   *
   * A timestamp rather than a boolean so a run that never reports back can be recognised
   * as abandoned. This store outlives every page — that is the point of it — so a flag
   * with no way to expire would keep a button disabled until a full page load.
   */
  pending: Record<string, number | undefined>;
  /** Skipped-row reports awaiting review, keyed by sync key. */
  reports: Record<string, SapSyncReport>;
  start: (key: string) => void;
  finish: (key: string) => void;
  setReport: (key: string, report: SapSyncReport | null) => void;
}

/**
 * Global, module-scoped store (not tied to any page) tracking in-flight SAP master-data
 * syncs. Lets a sync started from one module keep running — with a live toast — while the
 * user navigates elsewhere, and lets unrelated syncs (branches, warehouses, …) run at once.
 */
export const useSapSyncStore = create<SapSyncState>((set) => ({
  pending: {},
  reports: {},
  start: (key) => set((s) => ({ pending: { ...s.pending, [key]: Date.now() } })),
  finish: (key) =>
    set((s) => {
      const pending = { ...s.pending };
      delete pending[key];
      return { pending };
    }),
  setReport: (key, report) =>
    set((s) => {
      const reports = { ...s.reports };
      if (report) reports[key] = report;
      else delete reports[key];
      return { reports };
    }),
}));
