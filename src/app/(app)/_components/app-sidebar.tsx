import { SidebarBrand } from "@/app/(app)/_components/sidebar-brand";
import { SidebarNav } from "@/app/(app)/_components/sidebar-nav";
import { UserNav } from "@/app/(app)/_components/user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
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
  unreadAnnouncementCount?: number;
}

export function AppSidebar({
  branding,
  user,
  unreadAnnouncementCount = 0,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="app-sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <SidebarBrand
          name={branding.name}
          tagline={branding.tagline}
          logo={branding.logo}
        />
      </SidebarHeader>

      <SidebarContent className="themed-scrollbar">
        <SidebarNav
          permissions={user.permissions}
          isPlatformOperator={user.isPlatformOperator}
          countBadges={{ unreadAnnouncements: unreadAnnouncementCount }}
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserNav name={user.name} email={user.email} image={user.image} />
      </SidebarFooter>
    </Sidebar>
  );
}
