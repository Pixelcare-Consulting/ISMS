"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { announcementBodyToSafeHtml } from "@/features/announcements/lib/sanitize-announcement-html";
import { ANNOUNCEMENT_PROSE_CLASS } from "@/features/announcements/lib/announcement-prose";
import { cn } from "@/utils/cn";

interface AnnouncementBodyProps {
  body: string;
  className?: string;
  /** Clamp long bodies in list cards. */
  clamp?: boolean;
  /** With `clamp`, offer a Show more / Show less toggle when the body overflows. */
  expandable?: boolean;
}

export function AnnouncementBody({
  body,
  className,
  clamp = false,
  expandable = false,
}: AnnouncementBodyProps) {
  const { html, isPlainText } = announcementBodyToSafeHtml(body);
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const canExpand = clamp && expandable;
  const clamped = clamp && !expanded;

  useEffect(() => {
    const element = contentRef.current;
    if (!canExpand || expanded || !element) return;

    const measure = () => {
      setOverflows(element.scrollHeight > element.clientHeight);
    };
    measure();
    // Width changes and late-loading images can move the post past the preview height.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [canExpand, expanded, html]);

  return (
    <>
      {isPlainText ? (
        <div
          id={contentId}
          ref={contentRef}
          className={cn(
            "whitespace-pre-wrap text-sm text-foreground",
            clamped && "line-clamp-3",
            className,
          )}
        >
          {html}
        </div>
      ) : (
        <div
          id={contentId}
          ref={contentRef}
          className={cn(
            ANNOUNCEMENT_PROSE_CLASS,
            "overflow-x-auto",
            // Cap height rather than line-clamp: line-clamp needs inline children, which destroys tables.
            clamped && "max-h-40 overflow-y-hidden",
            className,
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {canExpand && overflows ? (
        <Button
          type="button"
          variant="link"
          className="mt-1 min-h-11 px-0"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </>
  );
}
