import { ShieldCheck } from "lucide-react";
import Image from "next/image";

interface SidebarBrandProps {
  name: string;
  tagline: string;
  logo?: string | null;
}

export function SidebarBrand({ name, tagline, logo }: SidebarBrandProps) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
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
      <div className="min-w-0 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-[13px] font-semibold leading-tight">{name}</p>
        <p className="truncate text-[11px] text-sidebar-muted">{tagline}</p>
      </div>
    </div>
  );
}
