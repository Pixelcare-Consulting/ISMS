"use client";

import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Megaphone,
  RefreshCw,
  Shield,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  countUnreadNotificationsAction,
  listMyNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions/notification.actions";
import type { NotificationInboxItem } from "@/features/notifications/repositories/notification.repository";
import { cn } from "@/utils/cn";

const PAGE_SIZE = 5;

type NotificationsHeaderActionProps = {
  initialUnreadCount?: number;
};

function formatRelativeTime(date: Date) {
  const value = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - value.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return value.toLocaleDateString();
}

function NotificationTypeIcon({
  item,
  className,
}: {
  item: Pick<NotificationInboxItem, "type" | "audience">;
  className?: string;
}) {
  const type = item.type.toLowerCase();

  if (type === "announcement" || type.startsWith("announcement.")) {
    return <Megaphone className={className} />;
  }
  // SAP auto-check: "SAP has new data, press Sync" — same icon as the Sync buttons.
  if (type.startsWith("sap.changes.")) {
    return <RefreshCw className={className} />;
  }
  if (type.includes("role") || item.audience === "ROLE") {
    return <Shield className={className} />;
  }
  if (
    type.includes("user") ||
    type.includes("personal") ||
    item.audience === "USER"
  ) {
    return <User className={className} />;
  }
  if (type.includes("system") || type.includes("info")) {
    return <Info className={className} />;
  }
  return <Bell className={className} />;
}

function NotificationRowContent({ item }: { item: NotificationInboxItem }) {
  const unread = !item.readAt;

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
          unread
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <NotificationTypeIcon item={item} className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm leading-snug",
              unread
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/80",
            )}
          >
            {item.title}
          </p>
          {unread ? (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
          ) : null}
        </div>
        {item.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          {formatRelativeTime(item.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function NotificationsHeaderAction({
  initialUnreadCount = 0,
}: NotificationsHeaderActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [syncedInitialUnread, setSyncedInitialUnread] =
    useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (initialUnreadCount !== syncedInitialUnread) {
    setSyncedInitialUnread(initialUnreadCount);
    setUnreadCount(initialUnreadCount);
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const canPrev = currentPage > 0;
  const canNext = currentPage < pageCount - 1 && total > PAGE_SIZE;

  function refreshInbox(nextPage = 0) {
    startTransition(async () => {
      const [result, unread] = await Promise.all([
        listMyNotificationsAction({
          limit: PAGE_SIZE,
          offset: nextPage * PAGE_SIZE,
        }),
        countUnreadNotificationsAction(),
      ]);
      setItems(result.items);
      setTotal(result.total);
      setPage(nextPage);
      setUnreadCount(unread);
      setLoaded(true);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      refreshInbox(0);
    }
  }

  function handleMarkAllRead() {
    if (unreadCount < 1) return;
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if ("error" in result && result.error) return;
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date(),
        })),
      );
      setUnreadCount(0);
      router.refresh();
    });
  }

  function handleItemClick(item: NotificationInboxItem) {
    if (!item.readAt) {
      startTransition(async () => {
        await markNotificationReadAction({ notificationId: item.id });
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, readAt: new Date() } : row,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
        router.refresh();
      });
    }
    setOpen(false);
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -top-1.5 -right-1.5 h-5 min-w-5 justify-center px-1 text-[10px] leading-none"
            >
              {badgeLabel}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-sm font-medium">Notifications</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={unreadCount < 1 || isPending}
            onClick={handleMarkAllRead}
          >
            Mark all as read
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!loaded && isPending ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Inbox className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                When something needs your attention, it will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const unread = !item.readAt;
                const rowClass = cn(
                  "block w-full px-3 py-3 text-left transition-colors",
                  unread
                    ? "bg-primary/[0.04] hover:bg-primary/[0.08]"
                    : "hover:bg-muted/60",
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className={rowClass}
                        onClick={() => handleItemClick(item)}
                      >
                        <NotificationRowContent item={item} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={rowClass}
                        onClick={() => handleItemClick(item)}
                      >
                        <NotificationRowContent item={item} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {loaded && total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={!canPrev || isPending}
              onClick={() => refreshInbox(currentPage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {currentPage + 1} / {pageCount}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={!canNext || isPending}
              onClick={() => refreshInbox(currentPage + 1)}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
