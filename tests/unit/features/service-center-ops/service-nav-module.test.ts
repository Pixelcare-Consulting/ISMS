import {
  appNavigation,
  filterNavByPermissions,
  flattenNavLinks,
  primaryNavDisplay,
  shouldShowSecondaryNav,
  type NavEntry,
} from "@/config/app-navigation";

function visibleGroup(permissions: string[], label: string): NavEntry | undefined {
  return filterNavByPermissions(appNavigation, permissions).find(
    (entry) => entry.type === "group" && entry.label === label,
  );
}

describe("Service center pages in the main menus", () => {
  it("has no separate Service menu", () => {
    expect(visibleGroup(["service_centers.orders.approve"], "Service")).toBeUndefined();
  });

  it("shows Service Center Orders under Orders", () => {
    const entry = visibleGroup(["service_centers.orders.approve"], "Orders");
    if (entry?.type !== "group") throw new Error("Orders menu is not visible");

    expect(flattenNavLinks(entry.items).map((link) => link.href)).toEqual([
      "/service-centers/orders",
    ]);
  });

  it("collapses a module with one visible page to that page", () => {
    const entry: NavEntry = {
      type: "group",
      label: "Module",
      icon: appNavigation[0].icon,
      items: [{ href: "/only", label: "Only page", icon: appNavigation[0].icon }],
    };

    expect(primaryNavDisplay(entry).label).toBe("Only page");
    expect(shouldShowSecondaryNav(entry)).toBe(false);
  });
});
