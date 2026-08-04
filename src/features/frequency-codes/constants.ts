import { DELIVERY_FREQUENCIES } from "@/features/branches/schemas/branch.schema";

export type DeliveryFrequencyValue = (typeof DELIVERY_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<DeliveryFrequencyValue, string> = {
  weekly: "Once a week",
  biweekly: "Once every two weeks",
  triweekly: "Once every three weeks",
  monthly: "Once a month",
  twice_weekly: "Twice a week",
  daily: "Daily",
  thrice_monthly: "Three times a month",
};

export const FREQUENCY_OPTIONS = DELIVERY_FREQUENCIES.map((value) => ({
  id: value,
  label: FREQUENCY_LABELS[value],
}));
