"use client";

import { useMemo, useState } from "react";

interface UseTableSelectionResult {
  selectedIds: string[];
  selectedCount: number;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  clearSelection: () => void;
  toggleRow: (id: string, checked: boolean) => void;
  toggleAll: (checked: boolean) => void;
  isRowSelected: (id: string) => boolean;
}

export function useTableSelection(rowIds: string[]): UseTableSelectionResult {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const rowIdSet = useMemo(() => new Set(rowIds), [rowIds]);
  const selectedInView = useMemo(
    () => selectedIds.filter((id) => rowIdSet.has(id)),
    [rowIdSet, selectedIds],
  );
  const selectedInViewSet = useMemo(() => new Set(selectedInView), [selectedInView]);

  const isAllSelected = rowIds.length > 0 && selectedInView.length === rowIds.length;
  const isPartiallySelected = selectedInView.length > 0 && selectedInView.length < rowIds.length;

  function clearSelection() {
    setSelectedIds([]);
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((currentId) => currentId !== id);
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        const merged = new Set([...prev, ...rowIds]);
        return Array.from(merged);
      }
      return prev.filter((id) => !rowIdSet.has(id));
    });
  }

  function isRowSelected(id: string) {
    return selectedInViewSet.has(id);
  }

  return {
    selectedIds,
    selectedCount: selectedInView.length,
    isAllSelected,
    isPartiallySelected,
    clearSelection,
    toggleRow,
    toggleAll,
    isRowSelected,
  };
}
