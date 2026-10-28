"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SidebarInset } from "@/components/ui/sidebar";
import { usePixelcareAiFullscreen } from "@/features/pixelcare-ai/components/fullscreen-provider";
import { isPixelcareAiWorkspacePath } from "@/features/pixelcare-ai/lib/workspace-path";
import { cn } from "@/utils/cn";

/**
 * Keeps AppSidebar mounted for soft navigations. Hides ISMS chrome only when
 * the user is on Pixelcare AI and has opted into fullscreen (localStorage).
 * Pathname comes from usePathname() — never stale x-pathname from the proxy.
 */
export function PixelcareAwareShell(props: {
  sidebar: ReactNode;
  contextual?: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { fullscreen } = usePixelcareAiFullscreen();
  const isAi = isPixelcareAiWorkspacePath(pathname);
  const hideChrome = isAi && fullscreen;

  return (
    <>
      {hideChrome ? null : props.sidebar}
      {hideChrome ? null : props.contextual}
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        {hideChrome ? null : props.header}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col bg-background",
            isAi ? "overflow-hidden" : "content-scrollbar overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "w-full",
              isAi
                ? "flex min-h-0 flex-1 flex-col"
                : "px-5 py-6 sm:px-7 lg:px-10",
            )}
          >
            {props.children}
          </div>
        </div>
      </SidebarInset>
    </>
  );
}
