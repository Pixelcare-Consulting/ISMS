/**
 * Curated badge colors for ReasonStatusCode.color.
 * Tenants pick a swatch in Settings → Status; badges use these classes app-wide.
 */

export const STATUS_COLOR_KEYS = [
  "slate",
  "sky",
  "emerald",
  "amber",
  "orange",
  "rose",
  "violet",
  "teal",
] as const;

export type StatusColorKey = (typeof STATUS_COLOR_KEYS)[number];

export interface StatusColorOption {
  key: StatusColorKey;
  label: string;
  /** Tailwind classes for outline Badge */
  className: string;
  /** Swatch preview (solid) */
  swatchClassName: string;
}

export const STATUS_COLOR_OPTIONS: StatusColorOption[] = [
  {
    key: "slate",
    label: "Slate",
    className: "border-slate-200 bg-slate-50 text-slate-800",
    swatchClassName: "bg-slate-500",
  },
  {
    key: "sky",
    label: "Sky",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    swatchClassName: "bg-sky-500",
  },
  {
    key: "emerald",
    label: "Emerald",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    swatchClassName: "bg-emerald-500",
  },
  {
    key: "amber",
    label: "Amber",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    swatchClassName: "bg-amber-500",
  },
  {
    key: "orange",
    label: "Orange",
    className: "border-orange-200 bg-orange-50 text-orange-800",
    swatchClassName: "bg-orange-500",
  },
  {
    key: "rose",
    label: "Rose",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    swatchClassName: "bg-rose-500",
  },
  {
    key: "violet",
    label: "Violet",
    className: "border-violet-200 bg-violet-50 text-violet-800",
    swatchClassName: "bg-violet-500",
  },
  {
    key: "teal",
    label: "Teal",
    className: "border-teal-200 bg-teal-50 text-teal-800",
    swatchClassName: "bg-teal-500",
  },
];

const BY_KEY = Object.fromEntries(
  STATUS_COLOR_OPTIONS.map((option) => [option.key, option]),
) as Record<StatusColorKey, StatusColorOption>;

/** Fallback when DB color is null — mirrors former hardcoded workflow map + inventory codes. */
const CODE_FALLBACK_COLOR: Record<string, StatusColorKey> = {
  pending: "amber",
  pending_ps: "amber",
  pending_tl: "amber",
  pending_logistics: "amber",
  pending_sp: "amber",
  for_transfer: "violet",
  for_pullout: "violet",
  FPO: "violet",
  accepted: "emerald",
  approved: "emerald",
  completed: "emerald",
  pulled_out: "emerald",
  STK: "emerald",
  rejected: "rose",
  cancelled: "rose",
  DEF: "rose",
  in_transit: "sky",
  DIT: "sky",
  partial: "violet",
  draft: "slate",
  scheduled: "teal",
  requested: "sky",
  SLD: "slate",
  RSV: "orange",
  OVR: "amber",
  MDL: "orange",
  OTH: "slate",
};

export function isStatusColorKey(value: string | null | undefined): value is StatusColorKey {
  return (
    typeof value === "string" &&
    (STATUS_COLOR_KEYS as readonly string[]).includes(value)
  );
}

export function resolveStatusColorKey(
  color: string | null | undefined,
  code: string,
): StatusColorKey {
  if (isStatusColorKey(color)) {
    return color;
  }
  return CODE_FALLBACK_COLOR[code] ?? "slate";
}

export function statusColorClassName(
  color: string | null | undefined,
  code: string,
): string {
  const key = resolveStatusColorKey(color, code);
  return BY_KEY[key].className;
}

export function statusColorOption(key: StatusColorKey): StatusColorOption {
  return BY_KEY[key];
}
