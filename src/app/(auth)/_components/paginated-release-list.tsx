"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ReleaseNoteCard } from "@/app/(auth)/_components/release-note-card";
import { Button } from "@/components/ui/button";
import { getAllReleases } from "@/lib/shared/version";

export function PaginatedReleaseList() {
  const releases = getAllReleases();
  const [page, setPage] = useState(0);
  const totalPages = releases.length;
  const currentRelease = releases[page];

  if (!currentRelease) {
    return (
      <p className="text-sm text-muted-foreground">No release notes yet.</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="content-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <ReleaseNoteCard release={currentRelease} isLatest={page === 0} />
      </div>

      {totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between border-t bg-card px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => current - 1)}
            disabled={page === 0}
            aria-label="Previous release"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>

          <p className="text-xs text-muted-foreground">
            {page + 1} of {totalPages}
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages - 1}
            aria-label="Next release"
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
