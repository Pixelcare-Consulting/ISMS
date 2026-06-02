"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogOut, UserCircle } from "lucide-react";
import { signOut } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isNavItemActive } from "@/config/app-navigation";
import { getInitials } from "@/utils/get-initials";

const PROFILE_HREF = "/settings/profile";

interface HeaderUserNavProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function HeaderUserNav({ name, email, image }: HeaderUserNavProps) {
  const pathname = usePathname();
  const isProfileActive = isNavItemActive(pathname, PROFILE_HREF);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-sidebar-accent/60">
        <Avatar className="size-8">
          {image ? (
            <AvatarImage src={image} alt={name ?? email ?? "User"} />
          ) : null}
          <AvatarFallback className="bg-white/15 text-xs text-sidebar-foreground">
            {getInitials(name ?? email)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">
          {name ?? "User"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate font-medium">{name ?? "User"}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={PROFILE_HREF}
            className={isProfileActive ? "bg-accent text-accent-foreground" : undefined}
          >
            <UserCircle className="size-4" />
            Profile Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
