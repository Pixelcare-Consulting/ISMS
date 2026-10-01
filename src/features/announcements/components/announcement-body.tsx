"use client";

import { announcementBodyToSafeHtml } from "@/features/announcements/lib/sanitize-announcement-html";
import { ANNOUNCEMENT_PROSE_CLASS } from "@/features/announcements/lib/announcement-prose";
import { cn } from "@/utils/cn";

interface AnnouncementBodyProps {
  body: string;
  className?: string;
  /** Clamp long bodies in list cards. */
  clamp?: boolean;
}

export function AnnouncementBody({
  body,
  className,
  clamp = false,
}: AnnouncementBodyProps) {
  const { html, isPlainText } = announcementBodyToSafeHtml(body);

  if (isPlainText) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap text-sm text-foreground",
          clamp && "line-clamp-3",
          className,
        )}
      >
        {html}
      </div>
    );
  }

  return (
    <div
      className={cn(
        ANNOUNCEMENT_PROSE_CLASS,
        !clamp && "overflow-x-auto",
        clamp && "line-clamp-3 **:inline",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
