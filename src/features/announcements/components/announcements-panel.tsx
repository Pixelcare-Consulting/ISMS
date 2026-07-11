"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteAnnouncementAction } from "@/features/announcements/actions/announcement.actions";
import {
  AnnouncementFormDialog,
  type AnnouncementDialogRow,
} from "@/features/announcements/components/announcement-form-dialog";
import { DeleteConfirmDialog } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { matchesTableSearch } from "@/utils/match-table-search";
import { Input } from "@/components/ui/input";

export type AnnouncementCard = AnnouncementDialogRow & {
  createdBy: { id: string; name: string | null; email: string };
  createdAt: string | Date;
};

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isCurrentlyLive(row: AnnouncementCard, now: Date): boolean {
  if (!row.isActive) return false;
  const publishedAt =
    typeof row.publishedAt === "string" ? new Date(row.publishedAt) : row.publishedAt;
  if (publishedAt.getTime() > now.getTime()) return false;
  if (!row.expiresAt) return true;
  const expiresAt =
    typeof row.expiresAt === "string" ? new Date(row.expiresAt) : row.expiresAt;
  return expiresAt.getTime() > now.getTime();
}

interface AnnouncementsPanelProps {
  announcements: AnnouncementCard[];
  canManage: boolean;
}

export function AnnouncementsPanel({
  announcements,
  canManage,
}: AnnouncementsPanelProps) {
  const router = useRouter();
  const [rows, setRows] = useState(announcements);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementCard | null>(null);
  const [deleting, setDeleting] = useState<AnnouncementCard | null>(null);
  const [pending, startTransition] = useTransition();
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    setRows(announcements);
  }, [announcements]);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.title,
          row.body,
          row.createdBy.name ?? "",
          row.createdBy.email,
        ]),
      ),
    [rows, query],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: AnnouncementCard) {
    setEditing(row);
    setFormOpen(true);
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteAnnouncementAction(deleting.id);
      if (result.error) {
        toast.error("Could not delete announcement", {
          description: result.error,
        });
        return;
      }
      toast.success("Announcement deleted");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search announcements…"
          className="max-w-sm"
        />
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            New announcement
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <Megaphone className="mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {rows.length === 0 ? "No announcements yet." : "No announcements match your search."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage && rows.length === 0
              ? "Create one to notify your team on the dashboard."
              : null}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((row) => {
            const live = isCurrentlyLive(row, now);
            return (
              <Card key={row.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{row.title}</CardTitle>
                      {live ? (
                        <Badge>Live</Badge>
                      ) : row.isActive ? (
                        <Badge variant="secondary">Scheduled</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    <CardDescription>
                      Published {formatDateTime(row.publishedAt)}
                      {row.expiresAt
                        ? ` · Expires ${formatDateTime(row.expiresAt)}`
                        : ""}
                      {" · "}
                      {row.createdBy.name ?? row.createdBy.email}
                    </CardDescription>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                        aria-label={`Edit ${row.title}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(row)}
                        aria-label={`Delete ${row.title}`}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">
                    {row.body}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canManage ? (
        <>
          <AnnouncementFormDialog
            open={formOpen}
            onOpenChange={(open) => {
              setFormOpen(open);
              if (!open) setEditing(null);
            }}
            announcement={editing}
          />
          <DeleteConfirmDialog
            open={!!deleting}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Delete announcement"
            description={
              deleting
                ? `Delete “${deleting.title}”? This cannot be undone.`
                : ""
            }
            pending={pending}
            onConfirm={handleDelete}
          />
        </>
      ) : null}
    </div>
  );
}
