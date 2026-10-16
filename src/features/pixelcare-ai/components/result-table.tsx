"use client";

import { cn } from "@/utils/cn";

export type ResultTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Monospace — use for SKU / order numbers */
  mono?: boolean;
  /** Allow long product names to wrap */
  wrap?: boolean;
};

export type ResultTableProps = {
  caption?: string;
  columns: ResultTableColumn[];
  rows: Array<Record<string, unknown>>;
  className?: string;
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  return text.length > 0 ? text : "—";
}

export function ResultTable(props: ResultTableProps) {
  if (props.rows.length === 0 || props.columns.length === 0) return null;

  return (
    <div className={cn("overflow-x-auto rounded-md border bg-background/60", props.className)}>
      {props.caption ? (
        <div className="border-b bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          {props.caption}
        </div>
      ) : null}
      <table className="w-full min-w-[20rem] border-collapse text-xs">
        <thead>
          <tr className="border-b bg-muted/40">
            {props.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-semibold text-foreground",
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  (!column.align || column.align === "left") && "text-left",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border/60 last:border-b-0 odd:bg-background even:bg-muted/20"
            >
              {props.columns.map((column) => {
                const raw = row[column.key];
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2 align-top text-foreground",
                      column.align === "right" && "text-right tabular-nums",
                      column.align === "center" && "text-center",
                      column.mono && "font-mono text-[11px]",
                      column.wrap ? "max-w-[14rem] break-words whitespace-normal" : "whitespace-nowrap",
                    )}
                  >
                    {formatCell(raw)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
