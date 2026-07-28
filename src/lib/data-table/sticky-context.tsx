"use client";

import { createContext, useContext } from "react";

/** Shared by GlobalDataTable + GlobalTableHead (sticky column headers). */
export const GlobalTableStickyContext = createContext(false);

export function useGlobalTableStickyHeader() {
  return useContext(GlobalTableStickyContext);
}
