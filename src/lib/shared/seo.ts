import type { Metadata } from "next";

import { APP_NAME } from "@/lib/shared/constants";

/** Browser tab / Open Graph title for a route segment (uses root `%s | APP_NAME` template). */
export function pageMetadata(title: string, description?: string): Metadata {
  return {
    title,
    ...(description ? { description } : {}),
  };
}

export function formatDocumentTitle(pageTitle: string | null | undefined): string {
  const trimmed = pageTitle?.trim();
  if (!trimmed || trimmed === APP_NAME) return APP_NAME;
  return `${trimmed} | ${APP_NAME}`;
}
