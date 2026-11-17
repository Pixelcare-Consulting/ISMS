import type { ReleaseChange } from "@/content/releases";

/** Compare release copy without case or punctuation so near-copies count as one note. */
function normalizeReleaseCopy(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sentences(value: string): string[] {
  const parts = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeReleaseCopy(part))
    .filter(Boolean);

  if (parts.length > 0) {
    return parts;
  }

  const whole = normalizeReleaseCopy(value);
  return whole ? [whole] : [];
}

/** True when `container` already says everything in `snippet`. */
function covers(container: string, snippet: string): boolean {
  if (!snippet || !container) {
    return false;
  }

  return container === snippet || container.includes(snippet);
}

/**
 * What's New shows a short summary and a typed change list.
 * Hide a summary line when every sentence already appears in a change,
 * and hide a change when a remaining summary already says it.
 */
export function visibleReleaseCopy(
  highlights: string[],
  changes: ReleaseChange[] | undefined,
): { highlights: string[]; changes: ReleaseChange[] } {
  const changeList = changes ?? [];
  const normalizedChanges = changeList.map((change) =>
    normalizeReleaseCopy(change.description),
  );

  const visibleHighlights = highlights.filter((highlight) => {
    const parts = sentences(highlight);
    if (parts.length === 0) {
      return false;
    }

    const alreadyInChanges = parts.every((part) =>
      normalizedChanges.some((change) => covers(change, part)),
    );
    return !alreadyInChanges;
  });

  const normalizedHighlights = visibleHighlights.map((highlight) =>
    normalizeReleaseCopy(highlight),
  );

  const visibleChanges = changeList.filter((change, index) => {
    const normalized = normalizedChanges[index] ?? "";
    if (!normalized) {
      return false;
    }

    const alreadyInSummary = normalizedHighlights.some((highlight) =>
      covers(highlight, normalized),
    );
    return !alreadyInSummary;
  });

  return { highlights: visibleHighlights, changes: visibleChanges };
}
