import {
  formatTransactionDate,
  officialSalesTransactionView,
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
