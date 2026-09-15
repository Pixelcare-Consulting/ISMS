"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ChevronsUpDown, CircleHelp, LogOut, UserCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isNavItemActive } from "@/config/app-navigation";
import { authClient } from "@/lib/auth/client";
import { queuePendingAuthToast } from "@/lib/auth/pending-auth-toast";
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
  const { isMobile } = useSidebar();
  const isProfileActive = isNavItemActive(pathname, PROFILE_HREF);
  const isHelpActive = isNavItemActive(pathname, HELP_HREF);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = name ?? "User";

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      queuePendingAuthToast({ kind: "signed-out" });
      // Hard navigation keeps the modal up until the document unloads.
      window.location.assign("/");
    } catch {
      setIsSigningOut(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 shrink-0 rounded-lg">
                {image ? (
                  <AvatarImage src={image} alt={displayName} />
                ) : null}
                <AvatarFallback className="rounded-lg bg-white/15 text-xs text-sidebar-foreground">
                  {getInitials(name ?? email)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-sidebar-muted">
                  {email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-muted" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 shrink-0 rounded-lg">
                  {image ? (
                    <AvatarImage src={image} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="rounded-lg text-xs">
                    {getInitials(name ?? email)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={PROFILE_HREF}>
                  <UserCircle
                    className={cn("size-4", isProfileActive && "text-primary")}
                  />
                  Profile Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={HELP_HREF}>
                  <CircleHelp
                    className={cn("size-4", isHelpActive && "text-primary")}
                  />
                  Help &amp; Support
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isSigningOut}
              onSelect={() => {
                void handleSignOut();
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <LoadingModal
          open={isSigningOut}
          variant="minimal"
          title="Signing out"
          description="Please wait while we sign you out and clear this session."
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
