import { appModules } from "@/config/app-modules";
import { groupPermissionsByModule } from "@/features/roles/lib/group-permissions-by-module";
import {
  MONTHLY_SIR_PERMISSION_CATALOG,
  MONTHLY_SIR_UPLOAD_SLUG,
  MONTHLY_SIR_VIEW_SLUG,
  resolveMonthlySirCapabilities,
} from "@/features/monthly-sir/constants/monthly-sir-permissions";
import { matchesTableSearch } from "@/utils/match-table-search";

describe("Monthly SIR permission card", () => {
  it("keeps View as the menu permission and lists each P-COUNT action", () => {
    const monthlySir = appModules.find((module) => module.id === "inventory_monthly_sir");
    expect(monthlySir?.navPermission).toBe(MONTHLY_SIR_VIEW_SLUG);
    expect(monthlySir?.actions.map((action) => action.label)).toEqual([
      "View",
      "Download template",
      "Scan serials",
      "Upload P-COUNT",
      "Upload on scheduled days",
      "Upload with free slots",
      "Generate variance",
      "Open P-Count",
      "Approve",
    ]);
    expect(
      matchesTableSearch("PCount", [monthlySir?.name, monthlySir?.description]),
    ).toBe(true);
    expect(
      matchesTableSearch("P-COUNT", [monthlySir?.name, monthlySir?.description]),
    ).toBe(true);
  });

  it("shows those checkboxes on the Monthly SIR card", () => {
    const groups = groupPermissionsByModule(
      MONTHLY_SIR_PERMISSION_CATALOG.map((permission) => ({
        id: permission.slug,
        slug: permission.slug,
        name: permission.name,
      })),
    );
    const card = groups.find((group) => group.moduleName === "Monthly SIR");
    expect(card?.permissions.map((permission) => permission.label)).toEqual([
      "View",
      "Download template",
      "Scan serials",
      "Upload P-COUNT",
      "Generate variance",
      "Open P-Count",
      "Approve",
    ]);
  });

  it("does not let View alone upload", () => {
    expect(resolveMonthlySirCapabilities([MONTHLY_SIR_VIEW_SLUG]).canUpload).toBe(false);
    expect(resolveMonthlySirCapabilities([MONTHLY_SIR_VIEW_SLUG]).canApprove).toBe(false);
    expect(
      resolveMonthlySirCapabilities([MONTHLY_SIR_VIEW_SLUG, MONTHLY_SIR_UPLOAD_SLUG]).canUpload,
    ).toBe(true);
  });
});
