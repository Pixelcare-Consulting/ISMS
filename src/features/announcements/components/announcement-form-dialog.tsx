"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createAnnouncementAction,
  updateAnnouncementAction,
} from "@/features/announcements/actions/announcement.actions";
import { AnnouncementRichEditor } from "@/features/announcements/components/announcement-rich-editor";
import { stripAnnouncementHtml } from "@/features/announcements/lib/sanitize-announcement-html";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AnnouncementDialogRow = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | Date;
  expiresAt: string | Date | null;
  isActive: boolean;
};

function toDatetimeLocalValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultPublishedAt(): string {
  return toDatetimeLocalValue(new Date());
}

function bodyHasContent(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  if (/<table\b/i.test(html)) return true;
  return stripAnnouncementHtml(html).length > 0;
}

interface AnnouncementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement?: AnnouncementDialogRow | null;
}

export function AnnouncementFormDialog({
  open,
  onOpenChange,
  announcement = null,
}: AnnouncementFormDialogProps) {
  const router = useRouter();
  const isEdit = !!announcement;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishedAt, setPublishedAt] = useState(defaultPublishedAt());
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Seed the fields each time the dialog opens — with the announcement being edited, or
   * blank for a new one — so a previous edit never bleeds into the next. Done during
   * render rather than in an effect, which would show the old values for a frame first.
   */
  const editing = open ? (announcement?.id ?? "new") : null;
  const [seededFor, setSeededFor] = useState<string | null>(editing);
  if (editing !== seededFor) {
    setSeededFor(editing);
    if (announcement) {
      setTitle(announcement.title);
      setBody(announcement.body);
      setPublishedAt(toDatetimeLocalValue(announcement.publishedAt));
      setExpiresAt(toDatetimeLocalValue(announcement.expiresAt));
      setIsActive(announcement.isActive);
    } else {
      setTitle("");
      setBody("");
      setPublishedAt(defaultPublishedAt());
      setExpiresAt("");
      setIsActive(true);
    }
    setError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!bodyHasContent(body)) {
      setError("Body is required");
      return;
    }

    const payload = {
      title: title.trim(),
      body,
      publishedAt,
      expiresAt: expiresAt || null,
      isActive,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateAnnouncementAction({
            ...payload,
            announcementId: announcement!.id,
          })
        : await createAnnouncementAction(payload);

      if (result.error) {
        setError(result.error);
        toast.error(isEdit ? "Could not update announcement" : "Could not create announcement", {
          description: result.error,
        });
        return;
      }

      toast.success(isEdit ? "Announcement updated" : "Announcement created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>{isEdit ? "Edit announcement" : "New announcement"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the announcement content and schedule."
              : "Publish a team announcement with formatting, links, images, and tables. Active posts appear on Dashboard → Overview."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
                placeholder="System maintenance this weekend"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <AnnouncementRichEditor
                key={seededFor ?? "closed"}
                value={body}
                onChange={setBody}
                disabled={pending}
                placeholder="Details for your team…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="announcement-published-at">Published at</Label>
                <Input
                  id="announcement-published-at"
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(event) => setPublishedAt(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-expires-at">Expires at (optional)</Label>
                <Input
                  id="announcement-expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              Active (show on Overview when published and not expired)
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
