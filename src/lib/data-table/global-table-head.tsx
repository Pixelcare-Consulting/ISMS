"use client";

import type { ComponentProps } from "react";

import { useGlobalTableStickyHeader } from "@/lib/data-table/sticky-context";
import { TABLE_STICKY_HEAD_CLASSNAME } from "@/components/data-table/table-sticky";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/utils/cn";

type GlobalTableHeadProps = ComponentProps<typeof TableHead>;

/** Column header cell — applies sticky freeze when GlobalDataTable has stickyHeader. */
export function GlobalTableHead({ className, ...props }: GlobalTableHeadProps) {
  const sticky = useGlobalTableStickyHeader();

  return (
    <TableHead
      className={cn(sticky && TABLE_STICKY_HEAD_CLASSNAME, className)}
      {...props}
    />
  );
}
