"use client";

import { useId, useState, type ReactNode } from "react";

import { TablePagination } from "@/components/data-table/table-pagination";
import { useClientTablePagination } from "@/components/data-table/use-client-table-pagination";
import { Input } from "@/components/ui/input";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

export type CompactLineAlign = "left" | "right" | "center";

export interface CompactLineColumn<T> {
  id: string;
  header: ReactNode;
  align?: CompactLineAlign;
  className?: string;
  cell: (row: T) => ReactNode;
}

function alignClass(align: CompactLineAlign | undefined): string {
  switch (align) {
    case "right":
      return "text-right";
    case "center":
      return "text-center";
    case "left":
    case undefined:
      return "text-left";
    default: {
      const unreachable: never = align;
      return unreachable;
    }
  }
}

/** Model code in bold, with the description on the line under it. */
export function CompactModelCell({ code, name }: { code: string; name: string }) {
  const description = name.trim();
  const showName = description.length > 0 && description !== code;
  const title = showName ? `${code} — ${description}` : code;
  return (
    <div className="min-w-0" title={title}>
      <p className="break-words font-medium leading-5">{code}</p>
      {showName ? (
        <p className="break-words text-sm leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * The Create Order lines list: search on the left, a numbered hairline row,
 * and the same page control. Callers pass only the columns that document has.
 */
export function CompactLineTable<T>({
  rows,
  getRowId,
  columns,
  searchText,
  searchPlaceholder = "Search model code or name",
  itemLabel,
  emptyMessage,
  noMatchMessage = "No matches.",
  summaryFor,
  toolbarAction,
  minWidth = "36rem",
  paginationInset = true,
}: {
  rows: readonly T[];
  getRowId: (row: T) => string;
  columns: readonly CompactLineColumn<T>[];
  searchText: (row: T) => Array<string | null | undefined>;
  searchPlaceholder?: string;
  itemLabel: string;
  emptyMessage: string;
  noMatchMessage?: string;
  /** Pager text for the rows that match the search. */
  summaryFor?: (visible: readonly T[]) => string;
  toolbarAction?: ReactNode;
  minWidth?: string;
  /** Pull the pager to the edges of the Create Order card. Off inside a dialog. */
  paginationInset?: boolean;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const filtered = rows.filter((row) => matchesTableSearch(query, searchText(row)));
  const { page, setPage, total, totalPages, pageItems, indexOffset } = useClientTablePagination(
    filtered,
    { resetKey: query },
  );
  const summary = summaryFor?.(filtered);

  return (
    <div>
      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          id={searchId}
          aria-label={searchPlaceholder}
          value={query}
          placeholder={searchPlaceholder}
          className="h-9 w-full min-w-0 flex-1 rounded-lg border-transparent bg-muted/70 shadow-none sm:max-w-md"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
        {toolbarAction ? (
          <div className="flex shrink-0 items-center gap-2 sm:ml-auto">{toolbarAction}</div>
        ) : null}
      </div>
      {pageItems.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          {rows.length === 0 ? emptyMessage : noMatchMessage}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth }}>
              <thead>
                <tr className="text-xs whitespace-nowrap text-muted-foreground">
                  <th className="w-11 border-b border-border/70 pb-2 text-center font-normal" scope="col">
                    No.
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={cn(
                        "border-b border-border/70 px-2 pb-2 font-normal",
                        alignClass(column.align),
                        column.className,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row, index) => (
                  <tr key={getRowId(row)} className="align-middle">
                    <td className="border-b border-border/60 py-2.5 text-center tabular-nums text-muted-foreground">
                      {indexOffset + index + 1}
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "border-b border-border/60 px-2 py-2.5",
                          alignClass(column.align),
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={paginationInset ? "-mx-5 sm:-mx-6" : undefined}>
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              label={itemLabel}
              summary={summary}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
