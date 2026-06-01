import { HeaderNav } from "@/app/(app)/_components/header-nav";
import { HeaderUserNav } from "@/app/(app)/_components/header-user-nav";
import { MobileNavDrawer } from "@/app/(app)/_components/mobile-nav-drawer";
import { SidebarBrand } from "@/app/(app)/_components/sidebar-brand";
import { WhatsNewHeaderAction } from "@/app/(app)/_components/whats-new-header-action";

interface AppHeaderProps {
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

export function AppHeader({ branding, user }: AppHeaderProps) {
  return (
    <header className="app-header grid h-14 w-full shrink-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)] items-center gap-x-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:gap-x-3 sm:px-4 lg:px-6">
      <SidebarBrand
        name={branding.name}
        tagline={branding.tagline}
        logo={branding.logo}
        compact
      />

      <div className="hidden min-w-0 justify-self-center lg:block">
        <HeaderNav
          permissions={user.permissions}
          isPlatformOperator={user.isPlatformOperator}
        />
      </div>

      <div className="flex items-center justify-end gap-1.5 sm:gap-2">
        <MobileNavDrawer branding={branding} user={user} />

        <div className="hidden h-6 w-px shrink-0 bg-white/10 lg:block" aria-hidden />

        <HeaderUserNav
          name={user.name}
          email={user.email}
          image={user.image}
        />

        <WhatsNewHeaderAction />
      </div>
    </header>
  );
}
