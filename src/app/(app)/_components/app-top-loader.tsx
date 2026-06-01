"use client";

import NextTopLoader from "nextjs-toploader";

export function AppTopLoader() {
  return (
    <NextTopLoader
      color="hsl(174 58% 39%)"
      height={3}
      showSpinner={false}
      crawl
      crawlSpeed={120}
      initialPosition={0.12}
      speed={280}
      zIndex={40}
    />
  );
}