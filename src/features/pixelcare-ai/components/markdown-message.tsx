"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { sanitizeMarkdownHref } from "@/features/pixelcare-ai/lib/sanitize-markdown-href";
import { cn } from "@/utils/cn";

const markdownComponents: Components = {
  a: ({ href, children }) => {
    const cleanHref = sanitizeMarkdownHref(href);
    return (
      <a href={cleanHref} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  code: ({ children, className }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>
    );
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[16rem] border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-3 py-2 align-top break-words">{children}</td>
  ),
  tr: ({ children }) => <tr className="even:bg-muted/20">{children}</tr>,
};

export function MarkdownMessage(props: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        "prose-a:text-primary prose-headings:mb-2 prose-headings:mt-3 prose-p:my-2",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-table:my-0",
        props.className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {props.content}
      </ReactMarkdown>
    </div>
  );
}
