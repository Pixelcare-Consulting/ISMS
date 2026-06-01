"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTopLoader } from "nextjs-toploader";

const LOADING_SELECTOR = "[data-app-page-loading]";

function isPageLoading() {
  return document.querySelector(LOADING_SELECTOR) !== null;
}

/** Keeps the top loader running until the RSC page replaces `loading.tsx`. */
export function AppNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loader = useTopLoader();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    loader.start();
    let observer: MutationObserver | null = null;
    let safety: number | undefined;

    function finishIfReady() {
      if (!isPageLoading()) {
        loader.done();
        return true;
      }
      return false;
    }

    function watchForPageReady() {
      if (finishIfReady()) return;

      observer = new MutationObserver(() => {
        if (finishIfReady()) observer?.disconnect();
      });

      observer.observe(document.body, { childList: true, subtree: true });

      safety = window.setTimeout(() => {
        loader.done();
        observer?.disconnect();
      }, 30_000);
    }

    // Wait for React to commit `loading.tsx` before deciding the page is ready.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(watchForPageReady);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (safety !== undefined) window.clearTimeout(safety);
    };
  }, [routeKey, loader]);

  return null;
}
