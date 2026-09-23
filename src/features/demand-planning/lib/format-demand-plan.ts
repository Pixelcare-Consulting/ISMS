const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const qtyFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 2,
});

export function formatDemandPeso(value: number): string {
  if (!Number.isFinite(value)) return pesoFormatter.format(0);
  return pesoFormatter.format(value);
}

export function formatDemandQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return qtyFormatter.format(value);
}

export function formatDemandShare(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDemandDays(value: number): string {
  if (!Number.isFinite(value)) return "0d";
  return `${value.toFixed(1)}d`;
}
