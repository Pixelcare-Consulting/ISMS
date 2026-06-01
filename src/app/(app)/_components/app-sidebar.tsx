import { SidebarBrand } from "@/app/(app)/_components/sidebar-brand";
import { SidebarNav } from "@/app/(app)/_components/sidebar-nav";
import { UserNav } from "@/app/(app)/_components/user-nav";

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

function SidebarDivider() {
  return <div className="mx-4 h-px bg-white/10" aria-hidden />;
}

export function AppSidebar({ branding, user }: AppSidebarProps) {
  return (
    <aside className="app-sidebar flex h-full w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <SidebarBrand
        name={branding.name}
        tagline={branding.tagline}
        logo={branding.logo}
      />

      <SidebarDivider />

      <SidebarNav
        permissions={user.permissions}
        isPlatformOperator={user.isPlatformOperator}
      />

      <SidebarDivider />

      <UserNav name={user.name} email={user.email} image={user.image} />
    </aside>
  );
}
