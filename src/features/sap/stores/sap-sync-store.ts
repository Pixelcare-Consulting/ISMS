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

export type SapSyncProgressPhase = "running" | "success" | "error" | "warning";

/**
 * Live progress for the planogram-style SAP sync modal.
 *
 * `processed` / `total` come from the engine's pass counters (`passRows` /
 * `totalAtSource`) — rows read in the current pass, not only the last slice.
 */
export interface SapSyncProgress {
  noun: SapSyncNoun;
  phase: SapSyncProgressPhase;
  title: string;
  description: string;
  /** Rows read so far in the current pass. */
  processed: number;
  /** SAP's row count for the entity, or null when it could not be measured. */
  total: number | null;
  summary?: string;
  errorMessage?: string;
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
  /** Planogram-style progress modal state, keyed by sync key. */
  progress: Record<string, SapSyncProgress>;
  /** Keys the user asked to stop after the current slice; cleared when a run starts. */
  stopRequested: Record<string, true | undefined>;
  start: (key: string) => void;
  finish: (key: string) => void;
  setReport: (key: string, report: SapSyncReport | null) => void;
  setProgress: (key: string, progress: SapSyncProgress | null) => void;
  requestStop: (key: string) => void;
  clearStop: (key: string) => void;
}

/**
 * Global, module-scoped store (not tied to any page) tracking in-flight SAP master-data
 * syncs. Lets a sync started from one module keep running — with a live progress modal —
 * while the user navigates elsewhere, and lets unrelated syncs (branches, warehouses, …)
 * run at once.
 */
export const useSapSyncStore = create<SapSyncState>((set) => ({
  pending: {},
  reports: {},
  progress: {},
  stopRequested: {},
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
  setProgress: (key, progress) =>
    set((s) => {
      const next = { ...s.progress };
      if (progress) next[key] = progress;
      else delete next[key];
      return { progress: next };
    }),
  requestStop: (key) =>
    set((s) => ({ stopRequested: { ...s.stopRequested, [key]: true } })),
  clearStop: (key) =>
    set((s) => {
      const stopRequested = { ...s.stopRequested };
      delete stopRequested[key];
      return { stopRequested };
    }),
}));
