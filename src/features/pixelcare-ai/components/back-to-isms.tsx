"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

/** Clear exit from the Pixelcare AI Assistant (BETA) back to the main ISMS app. */
export function BackToIsms(props: {
  className?: string;
  variant?: "ghost" | "outline" | "secondary";
  size?: "sm" | "default";
  label?: string;
}) {
  return (
    <Button
      asChild
      variant={props.variant ?? "outline"}
      size={props.size ?? "sm"}
      className={cn("gap-1.5", props.className)}
    >
      <Link href="/dashboard">
        <ArrowLeft className="size-3.5" aria-hidden />
        {props.label ?? "Back to ISMS"}
      </Link>
    </Button>
  );
}
