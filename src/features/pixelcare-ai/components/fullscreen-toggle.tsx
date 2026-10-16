"use client";

import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePixelcareAiFullscreen } from "@/features/pixelcare-ai/components/fullscreen-provider";
import { cn } from "@/utils/cn";

export function PixelcareAiFullscreenToggle(props: { className?: string }) {
  const { fullscreen, toggleFullscreen } = usePixelcareAiFullscreen();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("gap-1.5", props.className)}
      onClick={toggleFullscreen}
      aria-pressed={fullscreen}
      title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
    >
      {fullscreen ? (
        <Minimize2 className="size-3.5" aria-hidden />
      ) : (
        <Maximize2 className="size-3.5" aria-hidden />
      )}
      {fullscreen ? "Exit fullscreen" : "Fullscreen"}
    </Button>
  );
}
