"use client";

import { useMemo, useState, useTransition } from "react";
import { Heart, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";

import {
  addAnnouncementCommentAction,
  listAnnouncementReadersAction,
  markAnnouncementReadAction,
  toggleAnnouncementLikeAction,
} from "@/features/announcements/actions/announcement.actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getInitials } from "@/utils/get-initials";
import { cn } from "@/utils/cn";

export interface OverviewFeedItem {
  id: string;
  title: string;
  body: string;
  publishedAt: Date | string;
  createdBy: { id: string; name: string | null; email: string };
  readCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  readByMe: boolean;
  comments: {
    id: string;
    body: string;
    createdAt: Date | string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }[];
}

interface OverviewAnnouncementFeedProps {
  items: OverviewFeedItem[];
}

function formatPublished(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
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

interface ReaderRow {
  id: string;
  readAt: Date | string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    department: { name: string } | null;
    userRoles: { role: { name: string; slug: string } }[];
  };
}

export function OverviewAnnouncementFeed({ items }: OverviewAnnouncementFeedProps) {
  const [feed, setFeed] = useState(items);
  const [pending, startTransition] = useTransition();
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [readersOpen, setReadersOpen] = useState(false);
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [readersTitle, setReadersTitle] = useState("");

  const empty = feed.length === 0;

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      const result = await markAnnouncementReadAction(id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setFeed((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                readByMe: true,
                readCount: item.readByMe ? item.readCount : item.readCount + 1,
              }
            : item,
        ),
      );
    });
  };

  const handleLike = (id: string) => {
    startTransition(async () => {
      const result = await toggleAnnouncementLikeAction(id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      const liked = "liked" in result ? Boolean(result.liked) : false;
      setFeed((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            likedByMe: liked,
            likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)),
          };
        }),
      );
    });
  };

  const handleComment = (id: string) => {
    const body = (commentDrafts[id] ?? "").trim();
    if (!body) return;
    startTransition(async () => {
      const result = await addAnnouncementCommentAction({
        announcementId: id,
        body,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("comment" in result) || !result.comment) return;
      setCommentDrafts((prev) => ({ ...prev, [id]: "" }));
      setFeed((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                commentCount: item.commentCount + 1,
                comments: [...item.comments, result.comment],
              }
            : item,
        ),
      );
    });
  };

  const openReaders = (item: OverviewFeedItem) => {
    setReadersTitle(item.title);
    setReadersOpen(true);
    setReaders([]);
    startTransition(async () => {
      const rows = await listAnnouncementReadersAction(item.id);
      setReaders(rows as ReaderRow[]);
    });
  };

  const newestUnread = useMemo(
    () => feed.find((item) => !item.readByMe)?.id ?? null,
    [feed],
  );

  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No published announcements yet. When your team posts updates, they will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {feed.map((item) => {
          const author = item.createdBy.name || item.createdBy.email;
          const isNew = !item.readByMe && item.id === newestUnread;
          return (
            <article
              key={item.id}
              className="rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      {item.title}
                    </h2>
                    {isNew ? <Badge>New</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created by {author} on {formatPublished(item.publishedAt)}
                  </p>
                </div>
                {!item.readByMe ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    disabled={pending}
                    onClick={() => handleMarkRead(item.id)}
                  >
                    Mark as read
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Read</span>
                )}
              </div>

              <div className="prose prose-sm mt-4 max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
                {item.body}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(item.likedByMe && "text-rose-600")}
                  disabled={pending}
                  onClick={() => handleLike(item.id)}
                >
                  <Heart
                    className={cn("mr-1.5 size-4", item.likedByMe && "fill-current")}
                  />
                  {item.likeCount}
                </Button>
                <span className="inline-flex items-center text-sm text-muted-foreground">
                  <MessageCircle className="mr-1.5 size-4" />
                  {item.commentCount}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center text-sm text-primary hover:underline"
                  onClick={() => openReaders(item)}
                >
                  <Users className="mr-1.5 size-4" />
                  {item.readCount === 1
                    ? "1 person has read this announcement"
                    : `${item.readCount} people have read this announcement`}
                </button>
              </div>

              {item.comments.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {item.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-lg bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarImage src={comment.user.image ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {getInitials(comment.user.name || comment.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {comment.user.name || comment.user.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(comment.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {comment.body}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Textarea
                  value={commentDrafts[item.id] ?? ""}
                  onChange={(e) =>
                    setCommentDrafts((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                  placeholder="Add a comment or acknowledgment…"
                  className="min-h-11 flex-1 resize-y"
                  rows={2}
                />
                <Button
                  type="button"
                  size="sm"
                  className="sm:self-end"
                  disabled={pending || !(commentDrafts[item.id] ?? "").trim()}
                  onClick={() => handleComment(item.id)}
                >
                  Comment
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={readersOpen} onOpenChange={setReadersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>People who read the announcement</DialogTitle>
            <p className="truncate text-xs text-muted-foreground">{readersTitle}</p>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {readers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {pending ? "Loading…" : "No readers yet."}
              </p>
            ) : (
              readers.map((row) => {
                const role =
                  row.user.userRoles[0]?.role.name ??
                  row.user.department?.name ??
                  "—";
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2"
                  >
                    <Avatar className="size-9">
                      <AvatarImage src={row.user.image ?? undefined} />
                      <AvatarFallback>
                        {getInitials(row.user.name || row.user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.user.name || row.user.email}
                      </p>
                      <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                        {role}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
