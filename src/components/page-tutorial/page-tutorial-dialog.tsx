"use client";

import Link from "next/link";

import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PageTutorialDialogProps {
  content: PageTutorialContent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PageTutorialDialog({ content, open, onOpenChange }: PageTutorialDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 border-b bg-card px-6 py-5 text-left">
          <DialogTitle>{content.dialogTitle}</DialogTitle>
          {content.dialogDescription ? (
            <DialogDescription>{content.dialogDescription}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {content.sections.map((section) => (
              <section
                key={section.title}
                className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3"
              >
                <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                {section.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                ) : null}
                {section.bullets && section.bullets.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t bg-card px-6 py-4 sm:justify-between">
          {content.helpHref ? (
            <Button variant="link" className="h-auto px-0" asChild>
              <Link href={content.helpHref}>
                {content.helpLinkLabel ?? "More in Help & Support"}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
