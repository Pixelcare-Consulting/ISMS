"use client";

import { Toaster } from "sonner";

const toastBase =
  "group !rounded-lg !border !border-border !bg-card !text-card-foreground !shadow-md !gap-3 !py-3.5 !pl-4 !pr-10";

export function AppToaster() {
  return (
    <Toaster
      closeButton
      position="top-right"
      offset={{ top: "1rem", right: "1rem" }}
      visibleToasts={4}
      toastOptions={{
        duration: 4500,
        classNames: {
          toast: toastBase,
          title: "!text-sm !font-semibold !leading-snug !text-foreground",
          description: "!text-sm !text-muted-foreground",
          actionButton:
            "!rounded-md !border !border-border !bg-background !text-foreground hover:!bg-muted",
          cancelButton:
            "!rounded-md !border !border-border !bg-background !text-muted-foreground hover:!bg-muted",
          success: "!border-l-[3px] !border-l-primary [&_[data-icon]]:!text-primary",
          error: "!border-l-[3px] !border-l-destructive [&_[data-icon]]:!text-destructive",
          warning:
            "!border-l-[3px] !border-l-amber-500 [&_[data-icon]]:!text-amber-600",
          info: "!border-l-[3px] !border-l-primary [&_[data-icon]]:!text-primary",
          closeButton:
            "!absolute !right-3 !top-3 !left-auto !translate-x-0 !translate-y-0 !rounded-md !border !border-border !bg-muted/60 !text-muted-foreground hover:!bg-muted hover:!text-foreground",
        },
      }}
    />
  );
}
