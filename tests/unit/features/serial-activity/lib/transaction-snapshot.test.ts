import {
  formatTransactionDate,
  officialSalesTransactionView,
  replacementContextFromJson,
  resolveReplacementContext,
  snapshotToMetadata,
  transactionSnapshotFromMetadata,
  transactionSnapshotFromSale,
} from "@/features/serial-activity/lib/transaction-snapshot";

const sale = {
  transactionNo: "SI-100",
  transactionDate: new Date("2026-03-15T00:00:00.000Z"),
  transactionAmount: 12500,
  customerName: "Ana Reyes",
  customerNumber: "09171234567",
};

describe("transaction snapshot", () => {
  it("round-trips the five sale fields through audit metadata", () => {
    const snapshot = transactionSnapshotFromSale(sale);
    const metadata = {
      serial: "SN-1",
      actionKey: "DEL",
      ...snapshotToMetadata(snapshot),
    };

    expect(transactionSnapshotFromMetadata(metadata)).toEqual(snapshot);
    expect(snapshot).toEqual({
      transactionNo: "SI-100",
      transactionDate: "2026-03-15",
      transactionAmount: "12500",
      customerName: "Ana Reyes",
      customerNumber: "09171234567",
    });
  });

  it("leaves customer blank when the sale never had one", () => {
    const snapshot = transactionSnapshotFromSale({
      transactionNo: "SI-200",
      transactionDate: new Date("2026-01-02T00:00:00.000Z"),
      transactionAmount: 0,
      customerName: "  ",
      customerNumber: null,
    });

    expect(snapshot.customerName).toBeNull();
    expect(snapshot.customerNumber).toBeNull();
    expect(snapshot.transactionAmount).toBe("0");
    expect(snapshotToMetadata(snapshot)).not.toHaveProperty("customerName");
  });

  it("reads a contact number that was stored under the sale field name", () => {
    const snapshot = transactionSnapshotFromMetadata({
      transactionNo: "1911",
      contactNo: "09170001111",
    });

    expect(snapshot.customerNumber).toBe("09170001111");
    expect(snapshot.transactionDate).toBeNull();
  });
});

describe("replacement history mapping", () => {
  it("keeps the date and contact empty when the sale never had them", () => {
    const stored = replacementContextFromJson({
      transactionNo: "1911",
      transactionAmount: "9999",
      customerName: "pxc justine",
      returnedSerialNo: "32STV105A012600007",
      replacedSerialNo: "32STV105A012604338",
    });

    const resolved = resolveReplacementContext(stored, null);

    expect(resolved.transactionNo).toBe("1911");
    expect(resolved.customerName).toBe("pxc justine");
    expect(resolved.transactionDate).toBeNull();
    expect(resolved.customerNumber).toBeNull();
  });

  it("fills a missing date and contact from the live sale", () => {
    const stored = replacementContextFromJson({
      transactionNo: "1911",
      transactionAmount: "9999",
      customerName: "pxc justine",
    });
    const live = {
      ...transactionSnapshotFromSale({
        transactionNo: "1911",
        transactionDate: new Date("2026-11-01T00:00:00.000Z"),
        transactionAmount: 9999,
        customerName: "pxc justine",
        customerNumber: "09181234567",
      }),
      returnedSerialNo: "OLD-SN",
      replacedSerialNo: "NEW-SN",
    };

    const resolved = resolveReplacementContext(stored, live);

    expect(resolved.transactionDate).toBe("2026-11-01");
    expect(resolved.customerNumber).toBe("09181234567");
    expect(resolved.customerName).toBe("pxc justine");
  });
});

describe("official sales log mapping", () => {
  it("shows the transaction date from a DEL metadata row when the sale is gone", () => {
    const snapshot = transactionSnapshotFromSale(sale);
    const metadata = {
      serial: "SN-1",
      actionKey: "DEL",
      ...snapshotToMetadata(snapshot),
    };
    const view = officialSalesTransactionView(metadata, null);
    const dateLabel = formatTransactionDate("2026-03-15");

    expect(view.transaction?.transactionDate).toBe(dateLabel);
    expect(view.lines).toContain(`Transaction date: ${dateLabel}`);
    expect(view.transaction?.customerName).toBe("Ana Reyes");
    expect(view.transaction?.customerNumber).toBe("09171234567");
  });
});
