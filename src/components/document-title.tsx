"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

import { resolveRouteTitle } from "@/config/route-titles";
import { formatDocumentTitle } from "@/lib/shared/seo";

/** Client fallback so soft navigations keep the tab title in sync with the route map. */
export function DocumentTitle() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const next = formatDocumentTitle(resolveRouteTitle(pathname));
    document.title = next;

    // Next.js may apply RSC metadata after paint; re-assert once if it falls back to default.
    const frame = requestAnimationFrame(() => {
      if (document.title !== next) {
        document.title = next;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
