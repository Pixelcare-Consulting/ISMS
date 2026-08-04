/** Serializable Module Guide copy (icons are applied at the call site). */
export type ModuleGuideContent = {
  title: string;
  description: string;
  tips: { label: string }[];
  /** Omit when open state should not persist (e.g. Status tab reset). */
  storageKey?: string;
  badge?: string;
  eyebrow?: string;
};
