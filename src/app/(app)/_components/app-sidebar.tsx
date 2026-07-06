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
}

export function AppSidebar({ branding, user }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="app-sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <SidebarBrand
          name={branding.name}
          tagline={branding.tagline}
          logo={branding.logo}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav
          permissions={user.permissions}
          isPlatformOperator={user.isPlatformOperator}
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserNav name={user.name} email={user.email} image={user.image} />
      </SidebarFooter>
    </Sidebar>
  );
}
