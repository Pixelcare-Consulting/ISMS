import Link from "next/link";

import { Button } from "@/components/ui/button";

interface TablePaginationMeta {
  total: number;
  page: number;
  totalPages: number;
  itemLabel?: string;
}

interface TablePaginationProps {
  buildHref: (page: number) => string;
  meta?: TablePaginationMeta;
  total?: number;
  page?: number;
  totalPages?: number;
  label?: string;
}

export function TablePagination({
  buildHref,
  meta,
  total,
  page,
  totalPages,
  label = "item",
}: TablePaginationProps) {
  const resolvedTotal = meta?.total ?? total ?? 0;
  const resolvedPage = meta?.page ?? page ?? 1;
  const resolvedTotalPages = meta?.totalPages ?? totalPages ?? 1;
  const resolvedLabel = meta?.itemLabel ?? label;

  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {resolvedTotal} {resolvedLabel}
        {resolvedTotal === 1 ? "" : "s"} · page {resolvedPage} of {resolvedTotalPages}
      </span>
      <div className="flex gap-2">
        {resolvedPage > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(resolvedPage - 1)}>Previous</Link>
          </Button>
        ) : null}
        {resolvedPage < resolvedTotalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(resolvedPage + 1)}>Next</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
