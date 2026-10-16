import type { Metadata } from "next";

import { pageMetadata } from "@/lib/shared/seo";

export const metadata: Metadata = pageMetadata("Pixelcare AI Assistant (BETA)");

/**
 * Full-height segment under (app): inherits requireAuth and AppSidebar chrome.
 * PixelcareAwareShell decides embedded vs fullscreen from client pathname + preference.
 */
export default function InternalAiSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      {children}
    </div>
  );
}
