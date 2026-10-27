"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { NavCountBadges } from "@/app/(app)/_components/nav-counts";
import {
  CONTEXTUAL_SIDEBAR_COMPACT_QUERY,
  CONTEXTUAL_SIDEBAR_COOKIE,
  CONTEXTUAL_SIDEBAR_COOKIE_MAX_AGE,
  isContextualSidebarOpen,
  type ContextualSidebarPreference,
} from "@/app/(app)/_components/contextual-sidebar-preference";
import {
  appNavigation,
  filterNavByPermissions,
  findActiveNavEntry,
  shouldShowSecondaryNav,
  type NavEntry,
} from "@/config/app-navigation";
import { setupNavigation } from "@/config/setup-navigation";

type AppNavContextValue = {
  entries: NavEntry[];
  activeEntry: NavEntry | null;
  showSecondary: boolean;
  pathname: string;
  permissions: string[];
  countBadges: NavCountBadges;
  preference: ContextualSidebarPreference;
  secondaryExpanded: boolean;
  toggleSecondary: () => void;
};

const AppNavContext = createContext<AppNavContextValue | null>(null);

function subscribeCompactDesktop(onChange: () => void) {
  const query = window.matchMedia(CONTEXTUAL_SIDEBAR_COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readCompactDesktop() {
  return window.matchMedia(CONTEXTUAL_SIDEBAR_COMPACT_QUERY).matches;
}

function compactDesktopServerSnapshot() {
  return false;
}

function useIsCompactDesktop() {
  return useSyncExternalStore(
    subscribeCompactDesktop,
    readCompactDesktop,
    compactDesktopServerSnapshot,
  );
}

export function AppNavProvider(props: {
  useSetupNavigation: boolean;
  permissions: string[];
  isPlatformOperator: boolean;
  countBadges: NavCountBadges;
  secondaryPreference: ContextualSidebarPreference;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [preference, setPreference] = useState(props.secondaryPreference);
  const compactDesktop = useIsCompactDesktop();
  const secondaryExpanded = isContextualSidebarOpen(preference, !compactDesktop);

  const entries = useMemo(
    () =>
      filterNavByPermissions(
        props.useSetupNavigation ? setupNavigation : appNavigation,
        props.permissions,
        props.isPlatformOperator,
      ),
    [props.isPlatformOperator, props.permissions, props.useSetupNavigation],
  );

  const activeEntry = useMemo(
    () => findActiveNavEntry(pathname, entries),
    [entries, pathname],
  );

  const showSecondary = activeEntry
    ? shouldShowSecondaryNav(activeEntry)
    : false;

  const toggleSecondary = useCallback(() => {
    const compact = window.matchMedia(CONTEXTUAL_SIDEBAR_COMPACT_QUERY).matches;
    const currentlyOpen = isContextualSidebarOpen(preference, !compact);
    const next: ContextualSidebarPreference = currentlyOpen ? "closed" : "open";
    document.cookie = `${CONTEXTUAL_SIDEBAR_COOKIE}=${next === "open"}; path=/; max-age=${CONTEXTUAL_SIDEBAR_COOKIE_MAX_AGE}`;
    setPreference(next);
  }, [preference]);

  const value = useMemo<AppNavContextValue>(
    () => ({
      entries,
      activeEntry,
      showSecondary,
      pathname,
      permissions: props.permissions,
      countBadges: props.countBadges,
      preference,
      secondaryExpanded,
      toggleSecondary,
    }),
    [
      activeEntry,
      entries,
      pathname,
      preference,
      props.countBadges,
      props.permissions,
      secondaryExpanded,
      showSecondary,
      toggleSecondary,
    ],
  );

  return (
    <AppNavContext.Provider value={value}>{props.children}</AppNavContext.Provider>
  );
}

export function useAppNav(): AppNavContextValue {
  const context = useContext(AppNavContext);
  if (!context) {
    throw new Error("useAppNav must be used within AppNavProvider.");
  }
  return context;
}
