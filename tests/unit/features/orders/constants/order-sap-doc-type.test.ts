import { orderSapDocumentFields } from "@/features/orders/constants/order-sap-doc-type";

describe("orderSapDocumentFields", () => {
  it("splits a posted ITR into its type and its number", () => {
    expect(orderSapDocumentFields({ sapDocType: "ITR", sapDocNum: 1234 })).toEqual({
      type: "ITR (Consignment)",
      numberLabel: "ITR no.",
      number: "1234",
    });
  });

  it("labels an SO number and waits for SAP before showing one", () => {
    expect(orderSapDocumentFields({ sapDocType: "SO", sapDocNum: null })).toEqual({
      type: "SO (Outright)",
      numberLabel: "SO no.",
      number: "—",
    });
  });

  it("shows dashes before approval decides the document", () => {
    expect(orderSapDocumentFields({ sapDocType: null, sapDocNum: null })).toEqual({
      type: "—",
      numberLabel: "SAP document no.",
      number: "—",
    });
  });
});
