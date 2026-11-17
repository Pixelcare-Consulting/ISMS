"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";

import {
  SapJobDetailsDialog,
  type SapJobDetail,
} from "@/app/(app)/settings/sap-integration/_components/sap-job-details-dialog";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { processSapQueueAction } from "@/features/sap/actions/sap.actions";
import {
  SAP_JOB_STATUS_LABELS,
  SAP_JOB_TYPE_LABELS,
  formatSapJobDate,
  parseSapQueueView,
  sapJobDocumentNumber,
  sapJobNumberText,
  sapJobStatusClassName,
  sapJobsReadyToSend,
  sapJobWhen,
  type SapJobStatusCounts,
  type SapQueueView,
} from "@/features/sap/constants/sap-job-types";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { GlobalKpiCards, type KpiCardItem } from "@/lib/kpi-cards";

type SapJobRow = SapJobDetail;

const sapColumn = createColumnHelper<DataTableFeatures, SapJobRow>();

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SapJobSortField = "jobType" | "status" | "sapDocNum" | "createdAt";
type SapJobSortDir = "asc" | "desc";

interface SapIntegrationPanelProps {
  jobs: PaginatedList<SapJobRow>;
  counts: SapJobStatusCounts;
  initialSort?: string;
  initialSortDir?: string;
  initialView?: string;
  searchQuery?: string;
}

const EMPTY_QUEUE =
  "Nothing here yet. An approved order, return, transfer, or stock count shows up when ISMS sends it to SAP.";
const EMPTY_GROUP = "Nothing in this group.";
const EMPTY_SEARCH = "No documents match your search.";
const SEND_HELP =
  "Sends documents that are waiting, and tries again any that failed and can still be sent. It does not only send the rows on this page.";
const SEARCH_DEBOUNCE_MS = 300;

function buildSapJobsHref(options: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
  view?: SapQueueView;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (options.view) params.set("view", options.view);
  if (options.q) params.set("q", options.q);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  if (options.limit && options.limit !== DEFAULT_TABLE_PAGE_SIZE) {
    params.set("limit", String(options.limit));
  }
  if (options.sort) {
    params.set("sort", options.sort);
    if (options.sortDir) params.set("dir", options.sortDir);
  }
  const query = params.toString();
  return query ? `/settings/sap-integration?${query}` : "/settings/sap-integration";
}

function sendSummary(results: { status: string }[]): string {
  if (results.length === 0) return "Nothing was waiting to send.";
  const sent = results.filter((result) => result.status === "completed").length;
  const held = results.length - sent;
  if (held === 0) return sent === 1 ? "Sent 1 document." : `Sent ${sent} documents.`;
  if (sent === 0) {
    return held === 1
      ? "1 document still needs another try."
      : `${held} documents still need another try.`;
  }
  return `Sent ${sent}. ${held} still need another try.`;
}

export function SapIntegrationPanel({
  jobs,
  counts,
  initialSort = "",
  initialSortDir = "desc",
  initialView = "",
  searchQuery = "",
}: SapIntegrationPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState<SapJobRow | null>(null);
  const committedQuery = searchQuery.trim();
  const [query, setQuery] = useState(committedQuery);
  const urlQueryRef = useRef(committedQuery);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as SapJobSortDir;
  const view = parseSapQueueView(searchParams.get("view") ?? initialView);
  const pageSize = parseTablePageSize(jobs.limit);
  const canSend = sapJobsReadyToSend(counts);
  const waitingCount = counts.pending + counts.processing;
  const attentionCount = counts.failed + counts.dead_letter;
  const sentCount = counts.completed;
  const allCount = waitingCount + attentionCount + sentCount;

  useEffect(() => {
    const previous = urlQueryRef.current;
    urlQueryRef.current = committedQuery;
    setQuery((value) => (value.trim() === previous.trim() ? committedQuery : value));
  }, [committedQuery]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = query.trim();
      if (next === committedQuery) return;
      router.push(
        buildSapJobsHref({
          limit: pageSize,
          sort: sort || undefined,
          sortDir: sort ? sortDir : undefined,
          view,
          q: next || undefined,
        }),
        { scroll: false },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [committedQuery, pageSize, query, router, sort, sortDir, view]);

  function listHref(overrides: {
    page?: number;
    limit?: number;
    sort?: string;
    sortDir?: string;
    view?: SapQueueView;
  } = {}) {
    return buildSapJobsHref({
      page: overrides.page,
      limit: overrides.limit ?? pageSize,
      sort: overrides.sort ?? (sort || undefined),
      sortDir: overrides.sortDir ?? (sort ? sortDir : undefined),
      view: "view" in overrides ? overrides.view : view,
      q: committedQuery || undefined,
    });
  }

  function toggleSort(field: SapJobSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(listHref({ sort: next.sort, sortDir: next.dir }));
  }

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(listHref({ limit }));
  }

  function sendWaiting() {
    startTransition(async () => {
      try {
        const result = await processSapQueueAction();
        const summary = sendSummary(result.results);
        const sent = result.results.filter((row) => row.status === "completed").length;
        if (sent > 0) toast.success(summary);
        else toast.message(summary);
        router.refresh();
      } catch {
        toast.error("Could not send the waiting documents. Try again.");
      }
    });
  }

  const cardQuery = {
    limit: pageSize,
    sort: sort || undefined,
    sortDir: sort ? sortDir : undefined,
    q: committedQuery || undefined,
  };

  const cards: KpiCardItem[] = [
    {
      key: "all",
      label: "All",
      value: allCount,
      href: buildSapJobsHref(cardQuery),
      selected: !view,
    },
    {
      key: "waiting",
      label: "Waiting",
      value: waitingCount,
      hint: "Not sent yet.",
      tone: "info",
      href: buildSapJobsHref({ ...cardQuery, view: "waiting" }),
      selected: view === "waiting",
    },
    {
      key: "attention",
      label: "Needs attention",
      value: attentionCount,
      hint: "Try again from the row.",
      tone: attentionCount > 0 ? "danger" : "neutral",
      href: buildSapJobsHref({ ...cardQuery, view: "attention" }),
      selected: view === "attention",
    },
    {
      key: "sent",
      label: "Sent",
      value: sentCount,
      hint: "Already in SAP.",
      href: buildSapJobsHref({ ...cardQuery, view: "sent" }),
      selected: view === "sent",
    },
  ];

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        jobs.items.map((job) => sapJobDocumentNumber(job.payload)),
        jobs.items.map((job) => job.sapDocRef),
      ).filter((label) => label !== "—" && label !== "Not in SAP yet."),
    [jobs.items],
  );

  const indexOffset = (jobs.page - 1) * pageSize;
  const columns = useMemo(() => {
    const cols: DataTableColumn<SapJobRow>[] = [
      sapColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "w-0 whitespace-nowrap tabular-nums text-muted-foreground" },
      }),
      sapColumn.display({
        id: "jobType",
        header: "What was sent",
        enableSorting: true,
        cell: ({ row }) => SAP_JOB_TYPE_LABELS[row.original.jobType],
        meta: { className: "text-sm" },
      }),
      sapColumn.display({
        id: "document",
        header: "ISMS document",
        enableSorting: false,
        cell: ({ row }) => sapJobDocumentNumber(row.original.payload),
        meta: { className: "text-sm" },
      }),
      sapColumn.display({
        id: "sapDocNum",
        header: "SAP number",
        enableSorting: true,
        cell: ({ row }) => sapJobNumberText(row.original.sapDocRef),
        meta: { className: "text-sm" },
      }),
      sapColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="outline" className={sapJobStatusClassName(row.original.status)}>
            {SAP_JOB_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      }),
      sapColumn.display({
        id: "createdAt",
        header: "When",
        enableSorting: true,
        cell: ({ row }) => formatSapJobDate(sapJobWhen(row.original)),
        meta: { className: "text-sm whitespace-nowrap" },
      }),
      sapColumn.display({
        id: "actions",
        header: "Open",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="max-sm:h-11"
            onClick={() => setViewing(row.original)}
          >
            Details
          </Button>
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  const sendLabel = pending
    ? "Sending…"
    : canSend
      ? "Send waiting documents"
      : "Nothing is waiting to send.";

  const emptyMessage = committedQuery ? EMPTY_SEARCH : view ? EMPTY_GROUP : EMPTY_QUEUE;

  return (
    <div className="space-y-4">
      <GlobalKpiCards items={cards} />

      {/* <div className="space-y-2">
        <Button
          type="button"
          className="max-sm:h-11"
          disabled={pending || !canSend}
          onClick={sendWaiting}
        >
          {sendLabel}
        </Button>
        <p className="max-w-2xl text-sm text-muted-foreground">{SEND_HELP}</p>
      </div> */}

      <DataTable
        data={jobs.items}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (columnId) => toggleSort(columnId as SapJobSortField),
        }}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search document or SAP number…",
          suggestions,
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        pagination={{
          total: jobs.total,
          page: jobs.page,
          totalPages: jobs.totalPages,
          itemLabel: "document",
          buildHref: (page) => listHref({ page }),
        }}
        empty={jobs.items.length === 0}
        emptyMessage={emptyMessage}
      />

      <SapJobDetailsDialog job={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
