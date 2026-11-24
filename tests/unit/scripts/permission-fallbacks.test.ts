jest.mock("@/lib/auth/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth", () => ({ auth: jest.fn(), signOutServer: jest.fn() }));

import { groupPermissionsByModule } from "@/features/roles/lib/group-permissions-by-module";
import { PERMISSIONS } from "../../../prisma/seed-data";
import { lostActions, REMOVED_FALLBACKS } from "../../../scripts/permission-fallbacks";

describe("removed permission fallbacks", () => {
  it("only points admins at checkboxes the role editor shows", () => {
    const visible = new Set(
      groupPermissionsByModule(
        PERMISSIONS.map((permission) => ({
          id: permission.slug,
          slug: permission.slug,
          name: permission.name,
        })),
      ).flatMap((group) => group.permissions.map((item) => item.slug)),
    );

    for (const rule of REMOVED_FALLBACKS) {
      for (const slug of rule.needs) {
        expect({ action: rule.action, slug, visible: visible.has(slug) }).toEqual({
          action: rule.action,
          slug,
          visible: true,
        });
      }
    }
  });

  it("reports a Team Lead who approved pull-outs only through orders.approve", () => {
    const lost = lostActions(["pullouts.view", "pullouts.create", "orders.approve"]);

    expect(lost.find((item) => item.action === "Pull-outs: Approve / Reject")).toEqual({
      action: "Pull-outs: Approve / Reject",
      needs: ["pullouts.approve"],
      via: ["orders.approve"],
    });
  });

  it("reports nothing once the role has the checkbox", () => {
    const lost = lostActions(["pullouts.approve", "orders.approve"]);

    expect(lost.map((item) => item.action)).not.toContain("Pull-outs: Approve / Reject");
  });

  it("reports nothing for a role with no fallback slugs", () => {
    expect(lostActions(["pullouts.view", "returns.view"])).toEqual([]);
  });
});
