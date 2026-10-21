"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { listSaleableSerialsAction } from "@/features/sales/actions/sales.actions";
import {
  isToFollowSerial,
  TO_FOLLOW_SERIAL_ID,
  TO_FOLLOW_SERIAL_LABEL,
} from "@/features/sales/constants/to-follow-serial";

const SERIAL_SEARCH_DEBOUNCE_MS = 300;
const SERIAL_PAGE_LIMIT = 50;

export const NO_ELIGIBLE_STK_SERIALS_MESSAGE =
  "No eligible STK serials for this model at the selected stock source.";

export const NO_ELIGIBLE_STK_SERIALS_HINT =
  "The unit must be at that source and clear of pending defect inspection.";

type LoadedSerial = {
  id: string;
  serialNo: string;
  skuCode: string;
};

export type SaleSerialChoice = {
  id: string;
  serialNo: string;
  skuCode: string;
};

type LookupStatus = "idle" | "loading" | "ready" | "error";

function serialLabel(serialNo: string, skuCode: string): string {
  return skuCode ? `${serialNo} · ${skuCode}` : serialNo;
}

function mergeSerials(current: LoadedSerial[], next: LoadedSerial[]): LoadedSerial[] {
  const seen = new Set(current.map((row) => row.id));
  const merged = [...current];
  for (const row of next) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export function SaleSerialField({
  stockBranchId,
  modelId,
  value,
  onChange,
  excludeSerialIds,
  selectedSerial,
  disabled = false,
  popoverClassName,
  id,
}: {
  stockBranchId: string;
  modelId: string;
  value: string;
  onChange: (serial: SaleSerialChoice) => void;
  excludeSerialIds?: ReadonlySet<string>;
  /** Keeps a choice visible when its page is not loaded. Not a sold-unit listing. */
  selectedSerial?: SaleSerialChoice | null;
  disabled?: boolean;
  popoverClassName?: string;
  id?: string;
}) {
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const requestKey = `${stockBranchId}\0${modelId}\0${debouncedSearch}\0${retryNonce}`;
  const [loadedKey, setLoadedKey] = useState(requestKey);
  const [items, setItems] = useState<LoadedSerial[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LookupStatus>(() =>
    modelId && stockBranchId ? "loading" : "idle",
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const requestSeq = useRef(0);
  const activeKeyRef = useRef(requestKey);
  const debounceRef = useRef<number | null>(null);

  // Drop the previous page as soon as branch, model, or search changes so a
  // slower response cannot paint over the new request.
  if (loadedKey !== requestKey) {
    setLoadedKey(requestKey);
    setItems([]);
    setTotal(0);
    setPage(1);
    setLoadingMore(false);
    setStatus(stockBranchId && modelId ? "loading" : "idle");
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  function handleQueryChange(next: string) {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = next.trim();
    if (!trimmed) {
      setDebouncedSearch("");
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      setDebouncedSearch(trimmed);
    }, SERIAL_SEARCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    const key = requestKey;
    activeKeyRef.current = key;
    const seq = ++requestSeq.current;
    if (!stockBranchId || !modelId) return;

    let active = true;
    void (async () => {
      try {
        const result = await listSaleableSerialsAction({
          branchId: stockBranchId,
          modelId,
          search: debouncedSearch || undefined,
          page: 1,
          limit: SERIAL_PAGE_LIMIT,
        });
        if (!active || requestSeq.current !== seq || activeKeyRef.current !== key) {
          return;
        }
        setItems(
          result.items.map((row) => ({
            id: row.id,
            serialNo: row.serialNo,
            skuCode: row.skuCode,
          })),
        );
        setTotal(result.total);
        setPage(result.page);
        setStatus("ready");
      } catch {
        if (!active || requestSeq.current !== seq || activeKeyRef.current !== key) {
          return;
        }
        setStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [requestKey, stockBranchId, modelId, debouncedSearch]);

  async function loadMore() {
    if (!modelId || !stockBranchId || loadingMore) return;
    const key = activeKeyRef.current;
    const seq = requestSeq.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await listSaleableSerialsAction({
        branchId: stockBranchId,
        modelId,
        search: debouncedSearch || undefined,
        page: nextPage,
        limit: SERIAL_PAGE_LIMIT,
      });
      if (requestSeq.current !== seq || activeKeyRef.current !== key) return;
      setItems((current) =>
        mergeSerials(
          current,
          result.items.map((row) => ({
            id: row.id,
            serialNo: row.serialNo,
            skuCode: row.skuCode,
          })),
        ),
      );
      setTotal(result.total);
      setPage(result.page);
    } catch {
      if (requestSeq.current !== seq || activeKeyRef.current !== key) return;
      toast.error("Couldn't load more serials");
    } finally {
      if (requestSeq.current === seq && activeKeyRef.current === key) {
        setLoadingMore(false);
      }
    }
  }

  const excluded = new Set(excludeSerialIds);
  if (value && !isToFollowSerial(value)) excluded.delete(value);

  const available = items.filter((row) => !excluded.has(row.id));
  const pinned =
    selectedSerial &&
    value === selectedSerial.id &&
    !isToFollowSerial(selectedSerial.id)
      ? selectedSerial
      : null;

  const options = modelId
    ? [
        { id: TO_FOLLOW_SERIAL_ID, label: TO_FOLLOW_SERIAL_LABEL },
        ...(pinned &&
        !debouncedSearch &&
        !available.some((row) => row.id === pinned.id)
          ? [
              {
                id: pinned.id,
                label: serialLabel(pinned.serialNo, pinned.skuCode),
              },
            ]
          : []),
        ...available.map((row) => ({
          id: row.id,
          label: serialLabel(row.serialNo, row.skuCode),
        })),
      ]
    : [];

  const selectedOption = isToFollowSerial(value)
    ? { id: TO_FOLLOW_SERIAL_ID, label: TO_FOLLOW_SERIAL_LABEL }
    : pinned
      ? { id: pinned.id, label: serialLabel(pinned.serialNo, pinned.skuCode) }
      : null;

  function handleChange(nextId: string) {
    if (isToFollowSerial(nextId)) {
      onChange({
        id: TO_FOLLOW_SERIAL_ID,
        serialNo: TO_FOLLOW_SERIAL_LABEL,
        skuCode: "",
      });
      return;
    }
    const row =
      available.find((serial) => serial.id === nextId) ??
      (pinned?.id === nextId ? pinned : null);
    if (!row) return;
    onChange({ id: row.id, serialNo: row.serialNo, skuCode: row.skuCode });
  }

  const noEligible =
    status === "ready" && !debouncedSearch && total === 0;
  const noMatches =
    status === "ready" && Boolean(debouncedSearch) && total === 0;
  const allTaken =
    status === "ready" &&
    total > 0 &&
    available.length === 0 &&
    (!pinned || Boolean(debouncedSearch));

  return (
    <div className="space-y-1.5">
      <SearchableSelect
        id={id}
        label="Serial number *"
        options={options}
        value={value}
        onChange={handleChange}
        onQueryChange={modelId ? handleQueryChange : undefined}
        selectedOption={selectedOption}
        hasMore={status === "ready" && items.length < total}
        onLoadMore={() => void loadMore()}
        loadingMore={loadingMore}
        placeholder={
          !modelId ? "Select model first…" : "Select serial…"
        }
        searchPlaceholder="Search serials…"
        emptyMessage={
          !modelId
            ? "Select a model first."
            : NO_ELIGIBLE_STK_SERIALS_MESSAGE
        }
        disabled={disabled || !modelId}
        popoverClassName={popoverClassName}
      />

      {modelId && status === "loading" ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading serials…
        </p>
      ) : null}

      {modelId && status === "error" ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-xs text-destructive">Couldn&apos;t load serials.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetryNonce((nonce) => nonce + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {noMatches ? (
        <p className="text-xs text-muted-foreground" role="status">
          No serials match &quot;{debouncedSearch}&quot;.
        </p>
      ) : null}

      {noEligible ? (
        <div className="space-y-1 text-xs text-muted-foreground" role="status">
          <p>{NO_ELIGIBLE_STK_SERIALS_MESSAGE}</p>
          <p>{NO_ELIGIBLE_STK_SERIALS_HINT}</p>
        </div>
      ) : null}

      {allTaken ? (
        <p className="text-xs text-muted-foreground" role="status">
          {debouncedSearch
            ? "Matching serials are already on this transaction."
            : "Eligible serials for this model are already on this transaction."}
        </p>
      ) : null}
    </div>
  );
}
