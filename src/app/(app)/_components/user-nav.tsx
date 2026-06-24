"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ChevronDown, CircleHelp, LogOut, UserCircle } from "lucide-react";
import { signOut } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isNavItemActive } from "@/config/app-navigation";
import { getInitials } from "@/utils/get-initials";
import { cn } from "@/utils/cn";

const PROFILE_HREF = "/settings/profile";
const HELP_HREF = "/help";

interface UserNavProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function UserNav({ name, email, image }: UserNavProps) {
  const pathname = usePathname();
  const isProfileActive = isNavItemActive(pathname, PROFILE_HREF);
  const isHelpActive = isNavItemActive(pathname, HELP_HREF);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="px-3 pb-3">
      <div className="overflow-hidden rounded-lg bg-sidebar-accent/50">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-sidebar-accent/80"
          aria-expanded={isOpen}
          aria-controls="sidebar-profile-menu"
        >
          <Avatar className="size-9 shrink-0">
            {image ? (
              <AvatarImage src={image} alt={name ?? email ?? "User"} />
            ) : null}
            <AvatarFallback className="bg-white/15 text-xs text-sidebar-foreground">
              {getInitials(name ?? email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name ?? "User"}</p>
            <p className="truncate text-xs text-sidebar-muted">{email}</p>
          </div>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-sidebar-muted transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {isOpen ? (
          <div id="sidebar-profile-menu" className="space-y-1 border-t border-white/10 px-2 py-2">
            <Link
              href={PROFILE_HREF}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isProfileActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {isProfileActive ? (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              ) : null}
              <UserCircle
                className={cn(
                  "size-4 shrink-0",
                  isProfileActive
                    ? "text-primary"
                    : "text-sidebar-muted group-hover:text-sidebar-foreground",
                )}
              />
              Profile Settings
            </Link>
            <Link
              href={HELP_HREF}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                isHelpActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {isHelpActive ? (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              ) : null}
              <CircleHelp
                className={cn(
                  "size-4 shrink-0",
                  isHelpActive ? "text-primary" : "text-sidebar-muted group-hover:text-sidebar-foreground",
                )}
              />
              Help & Support
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="size-4 shrink-0" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
