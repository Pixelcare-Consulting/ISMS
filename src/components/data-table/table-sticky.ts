/**
 * Sticky / freeze table chrome (page scroll).
 *
 * Track down: search "sticky table header" or `TABLE_STICKY_*`.
 * Used by Orders first (`orders-table.tsx`); other tables can opt in later.
 *
 * Requires no overflow:hidden/auto ancestors between sticky nodes and the
 * main content scroller (Orders: overflow-visible shell + Table scrollContainer={false}).
 *
 * When the toolbar is also sticky, set `--sticky-toolbar-height` on a parent
 * (Orders measures the toolbar) so column headers sit underneath it.
 */
export const TABLE_STICKY_TOOLBAR_CLASSNAME =
  "sticky top-0 z-40 border-b bg-card";

export const TABLE_STICKY_HEAD_CLASSNAME =
  "sticky top-[var(--sticky-toolbar-height,0px)] z-30 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border))]";
