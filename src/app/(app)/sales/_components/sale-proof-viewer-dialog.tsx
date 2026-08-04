"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saleProofFileName,
  saleProofMimeType,
  saleProofViewUrl,
} from "@/features/sales/utils/sale-proof";
import { cn } from "@/utils/cn";

interface SaleProofViewerDialogProps {
  saleId: string;
  proofPaths: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zero-based index to show when the dialog opens. */
  initialIndex?: number;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

export function SaleProofViewerDialog({
  saleId,
  proofPaths,
  open,
  onOpenChange,
  initialIndex = 0,
}: SaleProofViewerDialogProps) {
  const maxIndex = Math.max(0, proofPaths.length - 1);
  const startIndex = Math.min(Math.max(0, initialIndex), maxIndex);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  if (proofPaths.length === 0) return null;

  const path = proofPaths[activeIndex] ?? proofPaths[0]!;
  const fileName = saleProofFileName(path);
  const mime = saleProofMimeType(path);
  const viewUrl = saleProofViewUrl(saleId, activeIndex);
  const canPrev = activeIndex > 0;
  const canNext = activeIndex < proofPaths.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-60"
        className="z-60 flex max-h-[min(92svh,56rem)] w-[min(calc(100vw-1.5rem),56rem)] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-5"
      >
        <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
          <DialogTitle>Proof attachments</DialogTitle>
          <DialogDescription>
            {proofPaths.length === 1
              ? "Preview the proof file for this sale."
              : `${activeIndex + 1} of ${proofPaths.length} · images and PDFs`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
          {proofPaths.length > 1 ? (
            <nav
              aria-label="Proof files"
              className="flex shrink-0 gap-1 overflow-x-auto sm:w-44 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden"
            >
              {proofPaths.map((p, index) => {
                const name = saleProofFileName(p);
                const type = saleProofMimeType(p);
                const selected = index === activeIndex;
                return (
                  <button
                    key={`${p}-${index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "flex min-w-38 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors sm:min-w-0",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
                    )}
                    aria-current={selected ? "true" : undefined}
                  >
                    {isImageMime(type) ? (
                      <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <FileText className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 truncate" title={name}>
                      {name}
                    </span>
                  </button>
                );
              })}
            </nav>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <p
                className="min-w-0 truncate text-sm font-medium"
                title={fileName}
              >
                {fileName}
              </p>
              <div className="flex items-center gap-1">
                {proofPaths.length > 1 ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canPrev}
                      onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                      aria-label="Previous proof"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canNext}
                      onClick={() =>
                        setActiveIndex((i) =>
                          Math.min(proofPaths.length - 1, i + 1),
                        )
                      }
                      aria-label="Next proof"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </>
                ) : null}
                <Button type="button" size="sm" variant="outline" asChild>
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </Button>
              </div>
            </div>

            <div className="relative min-h-64 flex-1 overflow-hidden rounded-lg border bg-zinc-950">
              {isImageMime(mime) ? (
                <Image
                  key={viewUrl}
                  src={viewUrl}
                  alt={fileName}
                  fill
                  unoptimized
                  className="object-contain p-2"
                  sizes="(max-width: 896px) 100vw, 56rem"
                />
              ) : isPdfMime(mime) ? (
                <iframe
                  key={viewUrl}
                  title={fileName}
                  src={viewUrl}
                  className="absolute inset-0 size-full bg-white"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-zinc-200">
                  <FileText className="size-8 opacity-70" aria-hidden />
                  <p>Preview is not available for this file type.</p>
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open file
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
