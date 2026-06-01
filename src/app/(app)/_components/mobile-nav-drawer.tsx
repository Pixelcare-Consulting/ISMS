"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { SidebarBrand } from "@/app/(app)/_components/sidebar-brand";
import { SidebarNav } from "@/app/(app)/_components/sidebar-nav";
import { UserNav } from "@/app/(app)/_components/user-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MobileNavDrawerProps {
  branding: {
    name: string;
    tagline: string;
    logo: string | null;
  };
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    permissions: string[];
    isPlatformOperator: boolean;
  };
}

export function MobileNavDrawer({ branding, user }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="fixed inset-y-0 right-0 left-auto top-0 flex h-dvh w-[min(100vw-2rem,320px)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 border-l border-sidebar-border bg-sidebar p-0 text-sidebar-foreground data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Navigation menu</DialogTitle>
        <div className="flex h-full flex-col">
          <SidebarBrand
            name={branding.name}
            tagline={branding.tagline}
            logo={branding.logo}
          />
          <div className="mx-4 h-px bg-white/10" aria-hidden />
          <SidebarNav
            permissions={user.permissions}
            isPlatformOperator={user.isPlatformOperator}
          />
          <div className="mx-4 h-px bg-white/10" aria-hidden />
          <UserNav name={user.name} email={user.email} image={user.image} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
