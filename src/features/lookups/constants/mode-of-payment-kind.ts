export const MODE_OF_PAYMENT_KINDS = ["CONSIGNMENT", "OUTRIGHT"] as const;
export type ModeOfPaymentKindValue = (typeof MODE_OF_PAYMENT_KINDS)[number];

export const MODE_OF_PAYMENT_KIND_LABELS: Record<ModeOfPaymentKindValue, string> = {
  CONSIGNMENT: "Consignment",
  OUTRIGHT: "Outright",
};

export const MODE_OF_PAYMENT_KIND_NOT_SET = "Not set";
