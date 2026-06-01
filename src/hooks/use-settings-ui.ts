"use client";

import { create } from "zustand";

interface SettingsUiState {
  isUserDialogOpen: boolean;
  setUserDialogOpen: (open: boolean) => void;
  isRoleDialogOpen: boolean;
  setRoleDialogOpen: (open: boolean) => void;
  closeAllDialogs: () => void;
}

export const useSettingsUi = create<SettingsUiState>((set) => ({
  isUserDialogOpen: false,
  setUserDialogOpen: (open) => set({ isUserDialogOpen: open }),
  isRoleDialogOpen: false,
  setRoleDialogOpen: (open) => set({ isRoleDialogOpen: open }),
  closeAllDialogs: () =>
    set({ isUserDialogOpen: false, isRoleDialogOpen: false }),
}));
