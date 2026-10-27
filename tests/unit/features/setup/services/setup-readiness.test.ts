jest.mock("@/lib/database/client", () => ({ prisma: {} }));

import { toSetupReadinessCards } from "@/features/setup/services/setup-readiness.service";

const ALL_MISSING = {
  companyNamed: false,
  warehouses: 0,
  branches: 0,
  users: 0,
  models: 0,
  priceLists: 0,
  pulloutClassifications: 0,
  saleTypes: 0,
};

const ALL_READY = {
  companyNamed: true,
  warehouses: 1,
  branches: 1,
  users: 1,
  models: 1,
  priceLists: 1,
  pulloutClassifications: 1,
  saleTypes: 1,
};

describe("toSetupReadinessCards", () => {
  it("marks every card missing when nothing is set up", () => {
    expect(toSetupReadinessCards(ALL_MISSING).map((card) => ({
      href: card.href,
      label: card.label,
      status: card.status,
    }))).toEqual([
      { href: "/settings/company", label: "Company", status: "missing" },
      { href: "/settings/branches", label: "Places", status: "missing" },
      { href: "/settings/users", label: "People", status: "missing" },
      { href: "/settings/master-data/models", label: "Catalog", status: "missing" },
      {
        href: "/settings/master-data/pullout-classifications",
        label: "Pull-out lookups",
        status: "missing",
      },
      {
        href: "/settings/master-data/sale-types",
        label: "Sales lookups",
        status: "missing",
      },
    ]);
  });

  it("marks every card ready when each requirement is met", () => {
    const cards = toSetupReadinessCards(ALL_READY);
    expect(cards.every((card) => card.status === "ready")).toBe(true);
    expect(cards.map((card) => card.label)).toEqual([
      "Company",
      "Places",
      "People",
      "Catalog",
      "Pull-out lookups",
      "Sales lookups",
    ]);
  });

  it("keeps Places and Catalog missing until both of their counts are present", () => {
    const byLabel = Object.fromEntries(
      toSetupReadinessCards({
        companyNamed: true,
        warehouses: 1,
        branches: 0,
        users: 1,
        models: 1,
        priceLists: 0,
        pulloutClassifications: 1,
        saleTypes: 0,
      }).map((card) => [card.label, card.status]),
    );

    expect(byLabel).toEqual({
      Company: "ready",
      Places: "missing",
      People: "ready",
      Catalog: "missing",
      "Pull-out lookups": "ready",
      "Sales lookups": "missing",
    });
  });
});
