export type DataTableAlign = "start" | "end";

/** Below the `md` breakpoint, detail columns move into the row-details control. */
export type DataTableMobile = "primary" | "detail";

export interface DataTableColumnMeta {
  align?: DataTableAlign;
  /** Wrap long text inside the cell. Headers stay on one line. */
  wrap?: boolean;
  mobile?: DataTableMobile;
  className?: string;
  headClassName?: string;
  /** Applied as the cell width. Use a fixed size for columns that should hug their content. */
  width?: string;
}
