import { toClientOrderListItem } from "@/features/orders/utils/to-client-order-list";

class Decimal {
  constructor(private readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

describe("toClientOrderListItem", () => {
  it("passes sku fields and drops price-list decimals and dates", () => {
    const periodStart = new Date("2026-10-01T00:00:00.000Z");
    const periodEnd = new Date("2026-10-31T00:00:00.000Z");
    const client = toClientOrderListItem({
      id: "order-1",
      orderNumber: "SO-1",
      details: [
        {
          id: "detail-1",
          quantity: 2,
          approvedQty: 1,
          remarks: null,
          amount: new Decimal("180000.00"),
          model: {
            id: "model-1",
            skuCode: "SKU-1",
            name: "TV",
            brandId: "brand-1",
            srp: new Decimal("75000.00"),
            priceLists: [
              {
                amount: new Decimal("90000.00"),
                periodStart,
                periodEnd,
                packageTypeId: null,
              },
            ],
          },
        },
      ],
    });

    expect(client.details).toEqual([
      {
        id: "detail-1",
        quantity: 2,
        approvedQty: 1,
        remarks: null,
        model: {
          id: "model-1",
          skuCode: "SKU-1",
          name: "TV",
          brandId: "brand-1",
          sku: "SKU-1",
        },
      },
    ]);
    expect(client.details[0]).not.toHaveProperty("amount");
    expect(client.details[0]?.model).not.toHaveProperty("srp");
    expect(client.details[0]?.model).not.toHaveProperty("priceLists");
    expect(JSON.stringify(client)).not.toContain("90000");
    expect(JSON.stringify(client)).not.toContain(periodStart.toISOString());
  });
});
