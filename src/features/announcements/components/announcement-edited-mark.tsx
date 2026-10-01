"use client";

import { useState } from "react";
import { toast } from "sonner";

import { listAnnouncementRevisionsAction } from "@/features/announcements/actions/announcement.actions";
import { AnnouncementBody } from "@/features/announcements/components/announcement-body";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Ignore sub-second clock skew between create and Prisma @updatedAt. */
export const ANNOUNCEMENT_EDITED_TOLERANCE_MS = 1000;

export function wasAnnouncementContentEdited(
  createdAt: Date | string | undefined,
  updatedAt: Date | string | undefined,
  fallbackBaseline?: Date | string,
): boolean {
  const baseline = createdAt ?? fallbackBaseline;
  if (!baseline || !updatedAt) return false;
  const created = typeof baseline === "string" ? new Date(baseline) : baseline;
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) {
    return false;
  }
  return updated.getTime() - created.getTime() > ANNOUNCEMENT_EDITED_TOLERANCE_MS;
}

export function announcementDisplayDate(input: {
  publishedAt: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): Date | string {
  if (
    wasAnnouncementContentEdited(
      input.createdAt,
      input.updatedAt,
      input.publishedAt,
    ) &&
    input.updatedAt
  ) {
    return input.updatedAt;
  }
  return input.publishedAt;
}

function formatRelative(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

interface AnnouncementRevisionRow {
  id: string;
  title: string;
  body: string;
  createdAt: Date | string;
}

interface AnnouncementEditedMarkProps {
  announcementId: string;
  currentTitle: string;
  /** Extra classes for the trigger (e.g. uppercase parent contexts). */
  className?: string;
}

export function AnnouncementEditedMark({
  announcementId,
  currentTitle,
  className,
}: AnnouncementEditedMarkProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<AnnouncementRevisionRow[] | null>(
    null,
  );

  const loadRevisions = async () => {
    setLoading(true);
    try {
      const rows = await listAnnouncementRevisionsAction(announcementId);
      setRevisions(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt,
        })),
      );
    } catch {
      toast.error("Could not load edit history");
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void loadRevisions();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            className ??
            "text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
          }
          aria-label="View announcement edit history"
        >
          · Edited
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 max-h-80 space-y-2 overflow-y-auto p-3"
      >
        <p className="text-xs font-medium text-foreground">Earlier versions</p>
        {loading || revisions === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : revisions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No earlier versions saved
          </p>
        ) : (
          <ul className="space-y-2">
            {revisions.map((revision) => (
              <li
                key={revision.id}
                className="rounded-none border border-border bg-muted/60 px-2.5 py-2"
              >
                <p className="text-[11px] text-muted-foreground">
                  {formatRelative(revision.createdAt)}
                </p>
                {revision.title !== currentTitle ? (
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {revision.title}
                  </p>
                ) : null}
                <AnnouncementBody
                  body={revision.body}
                  clamp
                  className="mt-1 text-xs"
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
