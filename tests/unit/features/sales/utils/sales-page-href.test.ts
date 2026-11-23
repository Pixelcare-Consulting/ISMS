import {
  buildSalesPageHref,
  parseSalesPageTab,
} from "@/features/sales/utils/sales-page-href";

describe("buildSalesPageHref", () => {
  it("leaves the default branch tab out", () => {
    expect(buildSalesPageHref({ tab: "branch", q: "SI-1" })).toBe("/sales?q=SI-1");
  });

  it("keeps the Service Center tab ahead of the list params", () => {
    expect(
      buildSalesPageHref({ tab: "service-center", page: 2, status: "service_returned", q: "SI 9" }),
    ).toBe("/sales?tab=service-center&page=2&status=service_returned&q=SI+9");
  });

  it("is the bare list path with nothing set", () => {
    expect(buildSalesPageHref({})).toBe("/sales");
  });
});

describe("parseSalesPageTab", () => {
  it.each(["branch", "service-center"])("accepts %s", (tab) => {
    expect(parseSalesPageTab(tab)).toBe(tab);
  });

  it.each([undefined, null, "", "returns", "SERVICE-CENTER"])("rejects %p", (value) => {
    expect(parseSalesPageTab(value)).toBeNull();
  });
});
