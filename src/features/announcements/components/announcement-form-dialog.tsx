"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createAnnouncementAction,
  updateAnnouncementAction,
} from "@/features/announcements/actions/announcement.actions";
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
import { Textarea } from "@/components/ui/textarea";

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

  useEffect(() => {
    if (!open) return;
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
  }, [open, announcement]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload = {
      title: title.trim(),
      body: body.trim(),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit announcement" : "New announcement"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the announcement content and schedule."
              : "Publish a tenant announcement. Active posts appear on the dashboard."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
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
            <Label htmlFor="announcement-body">Body</Label>
            <Textarea
              id="announcement-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              maxLength={10_000}
              rows={5}
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
            Active (show on dashboard when published and not expired)
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
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
