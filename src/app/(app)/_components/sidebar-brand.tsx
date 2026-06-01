import { ShieldCheck } from "lucide-react";
import Image from "next/image";

import { cn } from "@/utils/cn";

interface SidebarBrandProps {
  name: string;
  tagline: string;
  logo?: string | null;
  compact?: boolean;
}

export function SidebarBrand({ name, tagline, logo, compact = false }: SidebarBrandProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2.5 sm:gap-3",
        compact ? "py-0" : "h-[60px] px-5",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
        {logo ? (
          <Image
            src={logo}
            alt={`${name} logo`}
            width={32}
            height={32}
            className="size-full object-contain"
            unoptimized
          />
        ) : (
          <ShieldCheck className="size-4 text-primary" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight">{name}</p>
        <p
          className={cn(
            "truncate text-[11px] text-sidebar-muted",
            compact && "hidden xl:block",
          )}
        >
          {tagline}
        </p>
      </div>
    </div>
  );
}
