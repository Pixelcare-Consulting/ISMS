"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";

import {
  consumePendingAuthToast,
  messageForPendingAuthToast,
  SIGNED_OUT_NOTICE_PARAM,
  SIGNED_OUT_NOTICE_VALUE,
} from "@/lib/auth/pending-auth-toast";

const toastBase =
  "group !rounded-lg !border !border-border !bg-card !text-card-foreground !shadow-md !gap-3 !py-3.5 !pl-4 !pr-10";

export function AppToaster() {
  const pathname = usePathname();

  useEffect(() => {
    const pending = consumePendingAuthToast();
    const url = new URL(window.location.href);
    const signedOutNotice =
      url.searchParams.get(SIGNED_OUT_NOTICE_PARAM) === SIGNED_OUT_NOTICE_VALUE;

    if (pending) {
      toast.success(messageForPendingAuthToast(pending));
    } else if (signedOutNotice) {
      toast.success(messageForPendingAuthToast({ kind: "signed-out" }));
    }

    if (signedOutNotice) {
      url.searchParams.delete(SIGNED_OUT_NOTICE_PARAM);
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", next);
    }
  }, [pathname]);

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
