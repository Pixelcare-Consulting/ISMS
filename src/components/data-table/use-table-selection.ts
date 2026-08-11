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

/**
 * Row selection for client tables. Pass the selectable scope as `rowIds`
 * (typically all filtered/matching ids, not only the current page).
 * IDs are deduped so select-all / partial state stay accurate.
 */
export function useTableSelection(rowIds: string[]): UseTableSelectionResult {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const rowIdsKey = rowIds.join("\0");
  const uniqueRowIds = useMemo(() => {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of rowIdsKey.length === 0 ? [] : rowIdsKey.split("\0")) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    return next;
  }, [rowIdsKey]);

  const rowIdSet = useMemo(() => new Set(uniqueRowIds), [uniqueRowIds]);
  const selectedInView = useMemo(
    () => selectedIds.filter((id) => rowIdSet.has(id)),
    [rowIdSet, selectedIds],
  );
  const selectedInViewSet = useMemo(() => new Set(selectedInView), [selectedInView]);

  const isAllSelected =
    uniqueRowIds.length > 0 && selectedInView.length === uniqueRowIds.length;
  const isPartiallySelected =
    selectedInView.length > 0 && selectedInView.length < uniqueRowIds.length;

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
        return Array.from(new Set([...prev, ...uniqueRowIds]));
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
