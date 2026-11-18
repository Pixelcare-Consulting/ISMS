import {
  appNavigation,
  filterNavByPermissions,
  primaryNavDisplay,
  shouldShowSecondaryNav,
  type NavEntry,
} from "@/config/app-navigation";

function serviceEntry(permissions: string[]): NavEntry | undefined {
  return filterNavByPermissions(appNavigation, permissions).find(
    (entry) => entry.type === "group" && entry.label === "Service",
  );
}

describe("Service sidebar module", () => {
  it("stays the Service module with its page list when only SC Orders is visible", () => {
    const entry = serviceEntry(["service_centers.orders.approve"]);

    expect(entry).toBeDefined();
    expect(primaryNavDisplay(entry!).label).toBe("Service");
    expect(shouldShowSecondaryNav(entry!)).toBe(true);
  });

  it("is hidden when no Service page is permitted", () => {
    expect(serviceEntry(["orders.view"])).toBeUndefined();
  });

  it("leaves other one-page modules collapsed to that page", () => {
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
