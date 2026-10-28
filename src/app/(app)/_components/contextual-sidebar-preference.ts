export const CONTEXTUAL_SIDEBAR_COOKIE = "contextual_sidebar_state";
export const CONTEXTUAL_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const CONTEXTUAL_SIDEBAR_COMPACT_QUERY = "(max-width: 1279px)";

export type ContextualSidebarPreference = "open" | "closed" | "auto";

export function parseContextualSidebarPreference(
  value: string | undefined,
): ContextualSidebarPreference {
  if (value === "true") return "open";
  if (value === "false") return "closed";
  return "auto";
}

export function contextualSidebarWidthClass(
  preference: ContextualSidebarPreference,
): string {
  switch (preference) {
    case "open":
      return "w-64 border-r border-neutral-200";
    case "closed":
      return "w-0 border-r-0 invisible pointer-events-none";
    case "auto":
      return "w-64 border-r border-neutral-200 max-xl:w-0 max-xl:border-r-0 max-xl:invisible max-xl:pointer-events-none";
    default: {
      const _exhaustive: never = preference;
      return _exhaustive;
    }
  }
}

/** Whether the white column is open. Auto follows the measured desktop width. */
export function isContextualSidebarOpen(
  preference: ContextualSidebarPreference,
  measuredOpen: boolean,
): boolean {
  switch (preference) {
    case "open":
      return true;
    case "closed":
      return false;
    case "auto":
      return measuredOpen;
    default: {
      const _exhaustive: never = preference;
      return _exhaustive;
    }
  }
}
