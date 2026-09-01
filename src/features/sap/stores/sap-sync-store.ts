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
  /** Sync keys currently in flight — any button/badge for that key shows a spinner. */
  pending: Record<string, boolean>;
  /** Bumped each time a key's sync finishes, so a still-mounted button knows to refresh. */
  completedAt: Record<string, number>;
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
  completedAt: {},
  reports: {},
  start: (key) => set((s) => ({ pending: { ...s.pending, [key]: true } })),
  finish: (key) =>
    set((s) => ({
      pending: { ...s.pending, [key]: false },
      completedAt: { ...s.completedAt, [key]: Date.now() },
    })),
  setReport: (key, report) =>
    set((s) => {
      const reports = { ...s.reports };
      if (report) reports[key] = report;
      else delete reports[key];
      return { reports };
    }),
}));
