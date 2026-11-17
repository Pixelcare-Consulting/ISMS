jest.mock("@/lib/database/client", () => ({ prisma: {} }));

import {
  parseSalesListStatusFilter,
  salesListStatusCodesMatch,
} from "@/features/sales/constants/sales-list-status";
import { assembleSalesKpiStatuses } from "@/features/sales/services/sales-kpi.service";
import {
  resolveLineStatusCode,
  resolveListedLineStatus,
  type SaleStatusCodeRef,
} from "@/features/sales/utils/resolve-line-status";

const toFollow: SaleStatusCodeRef = {
  code: "FW",
  name: "TO FOLLOW",
  color: "orange",
};

const sold: SaleStatusCodeRef = {
  code: "SLD",
  name: "Sold",
  color: "slate",
};

const officialSold: SaleStatusCodeRef = {
  code: "OFS",
  name: "Official Sold",
  color: "teal",
};

const settings = new Map<string, SaleStatusCodeRef>([
  ["pending_cs", { code: "pending_cs", name: "Pending CS", color: "sky" }],
  ["pending_tl", { code: "pending_tl", name: "Pending TL", color: "amber" }],
  ["approved", { code: "approved", name: "Approved", color: "emerald" }],
  ["RETURNED", { code: "RETURNED", name: "Returned", color: "violet" }],
  ["REPLACED", { code: "REPLACED", name: "Replaced", color: "teal" }],
  ["closed", { code: "closed", name: "Closed", color: "slate" }],
  ["reserve", { code: "reserve", name: "Reserve", color: "orange" }],
  ["rejected", { code: "rejected", name: "Rejected", color: "rose" }],
]);

const inventoryCodes = [
  { code: "SLD", name: "Sold", color: "slate" },
  { code: "OFS", name: "Official Sold", color: "teal" },
  { code: "FW", name: "TO FOLLOW", color: "orange" },
];

function resolve(
  detail: {
    serialNumberId: string | null;
    statusCode?: SaleStatusCodeRef | null;
  },
  atrStatus: string,
  returnStatus?: string | null,
  actionType?: "return" | "replacement" | null,
  keepFrozenStatus?: boolean,
  codes: Map<string, SaleStatusCodeRef> = settings,
) {
  return resolveLineStatusCode(
    detail,
    atrStatus,
    toFollow,
    codes,
    returnStatus,
    null,
    keepFrozenStatus,
    actionType,
  );
}

describe("resolveLineStatusCode", () => {
  it.each([
    ["pending_cs", "Pending CS", "sky"],
    ["pending_tl", "Pending TL", "amber"],
    ["approved", "Approved", "emerald"],
  ] as const)(
    "shows the open return step %s with the Settings color",
    (status, name, color) => {
      expect(
        resolve(
          { serialNumberId: "serial-1", statusCode: sold },
          "open",
          status,
          "return",
        ),
      ).toEqual({ code: status, name, color });
    },
  );

  it("shows Returned from settings when a return is finished", () => {
    expect(
      resolve(
        { serialNumberId: "serial-1", statusCode: sold },
        "closed",
        "completed",
        "return",
      ),
    ).toEqual({ code: "RETURNED", name: "Returned", color: "violet" });
  });

  it("shows Replaced from settings when a replacement is finished", () => {
    expect(
      resolve(
        { serialNumberId: "serial-1", statusCode: sold },
        "open",
        "completed",
        "replacement",
      ),
    ).toEqual({ code: "REPLACED", name: "Replaced", color: "teal" });
  });

  it("uses the saved Returned color when the settings code casing differs", () => {
    const folded = new Map<string, SaleStatusCodeRef>([
      ["returned", { code: "returned", name: "Came back", color: "rose" }],
    ]);
    expect(
      resolve(
        { serialNumberId: "serial-1", statusCode: sold },
        "open",
        "completed",
        "return",
        false,
        folded,
      ),
    ).toEqual({ code: "returned", name: "Came back", color: "rose" });
  });

  it("sends a rejected request back to the sale status", () => {
    expect(
      resolve(
        { serialNumberId: "serial-1", statusCode: officialSold },
        "open",
        "rejected",
        "return",
      ),
    ).toEqual(officialSold);
    expect(
      resolve(
        { serialNumberId: "serial-1", statusCode: sold },
        "closed",
        "rejected",
        "return",
      ),
    ).toEqual({ code: "closed", name: "Closed", color: "slate" });
  });

  it("shows Closed for a closed sale with no return", () => {
    expect(
      resolve({ serialNumberId: "serial-1", statusCode: sold }, "closed"),
    ).toEqual({ code: "closed", name: "Closed", color: "slate" });
  });

  it("shows Reserve when a reserve sale has no serial", () => {
    expect(
      resolve(
        { serialNumberId: null, statusCode: toFollow },
        "reserve",
      ),
    ).toEqual({ code: "reserve", name: "Reserve", color: "orange" });
  });

  it("keeps Sold, Official Sold, or TO FOLLOW when there is no return", () => {
    expect(
      resolve({ serialNumberId: "serial-1", statusCode: sold }, "open"),
    ).toEqual(sold);
    expect(
      resolve({ serialNumberId: "serial-1", statusCode: officialSold }, "open"),
    ).toEqual(officialSold);
    expect(
      resolve({ serialNumberId: null, statusCode: toFollow }, "open"),
    ).toEqual(toFollow);
  });

  it("keeps a sibling line on its sale status while another line has the return", () => {
    expect(
      resolve(
        { serialNumberId: "serial-2", statusCode: sold },
        "closed",
        null,
        null,
        true,
      ),
    ).toEqual(sold);
  });
});

describe("resolveListedLineStatus", () => {
  it("does not leave a rejected line on Rejected", () => {
    expect(
      resolveListedLineStatus(
        { id: "line-1", serialNumberId: "serial-1", statusCode: sold },
        {
          atrStatus: "open",
          returnRequest: {
            status: "rejected",
            saleDetailId: "line-1",
            actionType: "return",
          },
        },
        toFollow,
        settings,
      ),
    ).toEqual(sold);
  });

  it("applies the open step only to the line the request names", () => {
    const sale = {
      atrStatus: "open",
      returnRequest: {
        status: "pending_tl",
        saleDetailId: "line-1",
        actionType: "return" as const,
      },
    };
    expect(
      resolveListedLineStatus(
        { id: "line-1", serialNumberId: "serial-1", statusCode: sold },
        sale,
        toFollow,
        settings,
      ),
    ).toMatchObject({ code: "pending_tl", color: "amber" });
    expect(
      resolveListedLineStatus(
        { id: "line-2", serialNumberId: "serial-2", statusCode: officialSold },
        sale,
        toFollow,
        settings,
      ),
    ).toEqual(officialSold);
  });
});

describe("sales status cards and ?status=", () => {
  it("counts the same resolved statuses the table shows, including ATR steps with rows", () => {
    const statuses = assembleSalesKpiStatuses(inventoryCodes, [
      sold,
      sold,
      { code: "pending_cs", name: "Pending CS", color: "sky" },
      { code: "returned", name: "Came back", color: "rose" },
      null,
    ]);

    expect(statuses.map((status) => [status.code, status.count])).toEqual([
      ["SLD", 2],
      ["OFS", 0],
      ["FW", 0],
      ["pending_cs", 1],
      ["RETURNED", 1],
    ]);
    expect(statuses.find((status) => status.code === "pending_cs")).toMatchObject({
      name: "Pending CS",
      color: "sky",
    });
    expect(statuses.find((status) => status.code === "RETURNED")).toMatchObject({
      name: "Came back",
      color: "rose",
    });
  });

  it("filters a card through ?status=, including older returned links", () => {
    expect(parseSalesListStatusFilter("pending_cs")).toBe("pending_cs");
    expect(parseSalesListStatusFilter("RETURNED")).toBe("RETURNED");
    expect(parseSalesListStatusFilter("returned")).toBe("RETURNED");
    expect(parseSalesListStatusFilter("reserve")).toBe("reserve");
    expect(parseSalesListStatusFilter("returned_replaced")).toBeUndefined();
    expect(salesListStatusCodesMatch("pending_cs", "pending_cs")).toBe(true);
    expect(salesListStatusCodesMatch("returned", "RETURNED")).toBe(true);
    expect(salesListStatusCodesMatch("SLD", "SLD")).toBe(true);
  });
});

describe("resolveLineStatusCode for service center steps", () => {
  it.each(["pending_sc", "awaiting_stock"])(
    "shows Reserve ODRF while the request is %s",
    (status) => {
      expect(resolve({ serialNumberId: "sn-1", statusCode: sold }, "reserve", status, "replacement")).toMatchObject({
        code: "ODRF",
        name: "Reserve ODRF",
      });
    },
  );

  it("shows Replaced after the service center completes a replacement", () => {
    expect(resolve({ serialNumberId: "sn-2", statusCode: sold }, "closed", "completed", "replacement")).toMatchObject({
      code: "REPLACED",
    });
  });
});
