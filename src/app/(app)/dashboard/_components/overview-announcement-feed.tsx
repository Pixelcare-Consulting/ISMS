"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Heart, MessageCircle, Pencil, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  addAnnouncementCommentAction,
  deleteAnnouncementCommentAction,
  listAnnouncementCommentRevisionsAction,
  listAnnouncementCommentsAction,
  listAnnouncementReadersAction,
  markAnnouncementReadAction,
  toggleAnnouncementLikeAction,
  updateAnnouncementCommentAction,
} from "@/features/announcements/actions/announcement.actions";
import { AnnouncementBody } from "@/features/announcements/components/announcement-body";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getInitials } from "@/utils/get-initials";
import { cn } from "@/utils/cn";

const VISIBLE_COMMENT_LIMIT = 3;
const READER_AVATAR_LIMIT = 5;
/** Ignore sub-second clock skew between create and Prisma @updatedAt. */
const EDITED_TOLERANCE_MS = 1000;

export interface OverviewFeedReaderPreview {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface OverviewFeedComment {
  id: string;
  body: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

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
  readerPreviews: OverviewFeedReaderPreview[];
  comments: OverviewFeedComment[];
}

export interface OverviewFeedCurrentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

type FeedFilter = "all" | "new" | "earlier";

interface OverviewAnnouncementFeedProps {
  items: OverviewFeedItem[];
  currentUser: OverviewFeedCurrentUser;
  canManageAnnouncements: boolean;
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

function wasCommentEdited(
  createdAt: Date | string,
  updatedAt?: Date | string,
): boolean {
  if (!updatedAt) return false;
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) {
    return false;
  }
  return updated.getTime() - created.getTime() > EDITED_TOLERANCE_MS;
}

interface CommentRevisionRow {
  id: string;
  body: string;
  createdAt: Date | string;
  editedBy: { id: string; name: string | null; email: string };
}

function CommentEditedMark({ commentId }: { commentId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<CommentRevisionRow[] | null>(null);

  const loadRevisions = async () => {
    setLoading(true);
    try {
      const rows = await listAnnouncementCommentRevisionsAction(commentId);
      setRevisions(
        rows.map((row) => ({
          id: row.id,
          body: row.body,
          createdAt: row.createdAt,
          editedBy: row.editedBy,
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
          className="text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
          aria-label="View comment edit history"
        >
          · Edited
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-h-72 space-y-2 overflow-y-auto p-3"
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
                <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">
                  {revision.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
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

function ReaderAvatarStack({
  readers,
  readCount,
  onOpen,
}: {
  readers: OverviewFeedReaderPreview[];
  readCount: number;
  onOpen: () => void;
}) {
  if (readCount <= 0) return null;

  const showOverflow = readCount > READER_AVATAR_LIMIT;
  const visible = readers.slice(
    0,
    showOverflow ? READER_AVATAR_LIMIT - 1 : READER_AVATAR_LIMIT,
  );
  const overflow = showOverflow
    ? Math.max(0, readCount - visible.length)
    : 0;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      onClick={onOpen}
      aria-label={
        readCount === 1
          ? "1 person has read this announcement"
          : `${readCount} people have read this announcement`
      }
    >
      {visible.length > 0 || overflow > 0 ? (
        <span className="flex items-center -space-x-2" aria-hidden>
          {visible.map((reader, index) => (
            <Avatar
              key={reader.id}
              className="size-6 border-2 border-white dark:border-card"
              style={{ zIndex: READER_AVATAR_LIMIT - index }}
            >
              <AvatarImage src={reader.image ?? undefined} />
              <AvatarFallback className="bg-slate-700 text-[9px] font-semibold text-white dark:bg-slate-600">
                {getInitials(reader.name || reader.email)}
              </AvatarFallback>
            </Avatar>
          ))}
          {overflow > 0 ? (
            <span className="relative z-1 flex size-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[9px] font-semibold text-slate-700 dark:border-card dark:bg-slate-600 dark:text-slate-100">
              +{overflow}
            </span>
          ) : null}
        </span>
      ) : (
        <Users className="size-4" />
      )}
      <span>
        {readCount === 1
          ? "1 person has read this announcement"
          : `${readCount} people have read this announcement`}
      </span>
    </button>
  );
}

export function OverviewAnnouncementFeed({
  items,
  currentUser,
  canManageAnnouncements,
}: OverviewAnnouncementFeedProps) {
  const [feed, setFeed] = useState(items);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [titleQuery, setTitleQuery] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>(
    {},
  );
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [readersOpen, setReadersOpen] = useState(false);
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [readersTitle, setReadersTitle] = useState("");
  const commentInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>(
    {},
  );

  const filteredFeed = useMemo(() => {
    const q = titleQuery.trim().toLowerCase();
    return feed.filter((item) => {
      if (filter === "new" && item.readByMe) return false;
      if (filter === "earlier" && !item.readByMe) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [feed, filter, titleQuery]);

  const { unreadItems, readItems } = useMemo(() => {
    const unread: OverviewFeedItem[] = [];
    const read: OverviewFeedItem[] = [];
    for (const item of filteredFeed) {
      if (item.readByMe) read.push(item);
      else unread.push(item);
    }
    return { unreadItems: unread, readItems: read };
  }, [filteredFeed]);

  const emptyFeed = feed.length === 0;
  const emptyFiltered = filteredFeed.length === 0;

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      const result = await markAnnouncementReadAction(id);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setFeed((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (item.readByMe) return item;

          const previews = item.readerPreviews ?? [];
          const alreadyPreviewed = previews.some(
            (reader) => reader.id === currentUser.id,
          );
          const nextPreviews = alreadyPreviewed
            ? previews
            : [
                {
                  id: currentUser.id,
                  name: currentUser.name,
                  email: currentUser.email,
                  image: currentUser.image,
                },
                ...previews,
              ].slice(0, READER_AVATAR_LIMIT);

          return {
            ...item,
            readByMe: true,
            readCount: item.readCount + 1,
            readerPreviews: nextPreviews,
          };
        }),
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

  const handleShowAllComments = (item: OverviewFeedItem) => {
    setExpandedComments((prev) => ({ ...prev, [item.id]: true }));
    if (item.comments.length >= item.commentCount) return;

    startTransition(async () => {
      const rows = await listAnnouncementCommentsAction(item.id);
      setFeed((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                comments: rows.map((c) => ({
                  id: c.id,
                  body: c.body,
                  createdAt: c.createdAt,
                  updatedAt: c.updatedAt,
                  user: c.user,
                })),
                commentCount: rows.length,
              }
            : row,
        ),
      );
    });
  };

  const handleFocusComments = (item: OverviewFeedItem) => {
    handleShowAllComments(item);
    requestAnimationFrame(() => {
      const el = commentInputRefs.current[item.id];
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el?.focus();
    });
  };

  const handleSaveEdit = (announcementId: string, commentId: string) => {
    const body = editDraft.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await updateAnnouncementCommentAction({ commentId, body });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("comment" in result) || !result.comment) return;
      setFeed((prev) =>
        prev.map((item) =>
          item.id === announcementId
            ? {
                ...item,
                comments: item.comments.map((c) =>
                  c.id === commentId
                    ? {
                        ...c,
                        body: result.comment.body,
                        updatedAt: result.comment.updatedAt,
                      }
                    : c,
                ),
              }
            : item,
        ),
      );
      setEditingCommentId(null);
      setEditDraft("");
      toast.success("Comment updated");
    });
  };

  const handleDeleteComment = (announcementId: string, commentId: string) => {
    startTransition(async () => {
      const result = await deleteAnnouncementCommentAction(commentId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setFeed((prev) =>
        prev.map((item) =>
          item.id === announcementId
            ? {
                ...item,
                commentCount: Math.max(0, item.commentCount - 1),
                comments: item.comments.filter((c) => c.id !== commentId),
              }
            : item,
        ),
      );
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditDraft("");
      }
      toast.success("Comment deleted");
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

  function renderComments(item: OverviewFeedItem) {
    const expanded = Boolean(expandedComments[item.id]);
    const total = Math.max(item.commentCount, item.comments.length);
    const visible = expanded
      ? item.comments
      : item.comments.slice(-VISIBLE_COMMENT_LIMIT);
    const hiddenCount = Math.max(0, total - visible.length);

    return (
      <>
        {!expanded && hiddenCount > 0 ? (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-sm"
            disabled={pending}
            onClick={() => handleShowAllComments(item)}
          >
            Show all {total} comments
          </Button>
        ) : null}

        {visible.length > 0 ? (
          <ul className="mt-1 space-y-2">
            {visible.map((comment) => {
              const isOwner = comment.user.id === currentUser.id;
              const canEdit = isOwner;
              const canDelete = isOwner || canManageAnnouncements;
              const isEditing = editingCommentId === comment.id;

              return (
                <li
                  key={comment.id}
                  className="rounded-none border border-border bg-muted px-3 py-3 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="size-6 shrink-0">
                      <AvatarImage src={comment.user.image ?? undefined} />
                      <AvatarFallback className="bg-slate-700 text-[10px] font-semibold text-white dark:bg-slate-600">
                        {getInitials(comment.user.name || comment.user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium">
                          {comment.user.name || comment.user.email}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{formatRelative(comment.createdAt)}</span>
                          {wasCommentEdited(comment.createdAt, comment.updatedAt) ? (
                            <CommentEditedMark commentId={comment.id} />
                          ) : null}
                        </span>
                        {(canEdit || canDelete) && !isEditing ? (
                          <span className="ml-auto flex items-center gap-1">
                            {canEdit ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={pending}
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditDraft(comment.body);
                                }}
                              >
                                <Pencil className="mr-1 size-3" />
                                Edit
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                disabled={pending}
                                onClick={() =>
                                  handleDeleteComment(item.id, comment.id)
                                }
                              >
                                <Trash2 className="mr-1 size-3" />
                                Delete
                              </Button>
                            ) : null}
                          </span>
                        ) : null}
                      </div>

                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="min-h-16 resize-y rounded-none border-border bg-white dark:bg-background"
                            rows={2}
                            maxLength={2000}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={pending || !editDraft.trim()}
                              onClick={() =>
                                handleSaveEdit(item.id, comment.id)
                              }
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditDraft("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-foreground">
                          {comment.body}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </>
    );
  }

  function renderItem(item: OverviewFeedItem) {
    const author = item.createdBy.name || item.createdBy.email;
    return (
      <article
        key={item.id}
        className="rounded-none border border-border bg-white px-5 py-5 dark:bg-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {item.title}
            </h2>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {formatPublished(item.publishedAt)}
              <span className="mx-1.5 text-border">·</span>
              <span className="normal-case tracking-normal">
                Created by {author}
              </span>
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

        <AnnouncementBody body={item.body} className="mt-4" />

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-3">
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={
              item.commentCount === 1
                ? "Show 1 comment"
                : `Show ${item.commentCount} comments`
            }
            onClick={() => handleFocusComments(item)}
          >
            <MessageCircle className="mr-1.5 size-4" />
            {item.commentCount}
          </Button>
          <ReaderAvatarStack
            readers={item.readerPreviews ?? []}
            readCount={item.readCount}
            onOpen={() => openReaders(item)}
          />
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {renderComments(item)}
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-none border border-border bg-muted p-3 sm:flex-row">
          <Textarea
            ref={(el) => {
              commentInputRefs.current[item.id] = el;
            }}
            value={commentDrafts[item.id] ?? ""}
            onChange={(e) =>
              setCommentDrafts((prev) => ({
                ...prev,
                [item.id]: e.target.value,
              }))
            }
            placeholder="Add a comment or acknowledgment…"
            className="min-h-11 flex-1 resize-y rounded-none border-border bg-white dark:bg-background"
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
  }

  function renderFilterBar() {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as FeedFilter)}
        >
          <SelectTrigger className="h-9 w-full rounded-none border-border bg-white shadow-none sm:w-44 dark:bg-card">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="new">New (unread)</SelectItem>
            <SelectItem value="earlier">Earlier (read)</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            placeholder="Search by title…"
            className="h-9 rounded-none border-border bg-white pl-9 shadow-none dark:bg-card"
            aria-label="Search announcements by title"
          />
        </div>
      </div>
    );
  }

  if (emptyFeed) {
    return (
      <div className="space-y-4">
        {renderFilterBar()}
        <div className="rounded-none border border-dashed border-border bg-white px-6 py-12 text-center dark:bg-card">
          <p className="text-sm text-muted-foreground">
            No published announcements yet. When your team posts updates, they will
            appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {renderFilterBar()}

        {emptyFiltered ? (
          <div className="rounded-none border border-dashed border-border bg-white px-6 py-12 text-center dark:bg-card">
            <p className="text-sm text-muted-foreground">
              No announcements match this filter.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {(filter === "all" || filter === "new") && unreadItems.length > 0 ? (
              <section className="rounded-none border border-border bg-slate-100 p-4 dark:bg-muted">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2>
                    <Badge className="rounded-none bg-primary px-2 py-0.5 text-xs font-semibold tracking-wide text-primary-foreground">
                      New
                    </Badge>
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {unreadItems.length} unread
                  </span>
                </div>
                <div className="space-y-4">
                  {unreadItems.map((item) => renderItem(item))}
                </div>
              </section>
            ) : null}

            {(filter === "all" || filter === "earlier") &&
            readItems.length > 0 ? (
              <section className="rounded-none border border-border bg-slate-100 p-4 dark:bg-muted">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2>
                    <Badge className="rounded-none border-transparent bg-slate-200 px-2 py-0.5 text-xs font-semibold tracking-wide text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                      Earlier
                    </Badge>
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {readItems.length} read
                  </span>
                </div>
                <div className="space-y-4">
                  {readItems.map((item) => renderItem(item))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={readersOpen} onOpenChange={setReadersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>People who read the announcement</DialogTitle>
            <p className="truncate text-xs text-muted-foreground">{readersTitle}</p>
          </DialogHeader>
          <div className="max-h-80 divide-y divide-border/50 overflow-y-auto">
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
                    className="flex items-center gap-3 px-1 py-3"
                  >
                    <Avatar className="size-9">
                      <AvatarImage src={row.user.image ?? undefined} />
                      <AvatarFallback className="bg-slate-700 font-semibold text-white dark:bg-slate-600">
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
