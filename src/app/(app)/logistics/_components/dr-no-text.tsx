/**
 * A delivery's DR#. DCS Remarks may hold several receipt codes on their own lines, so they
 * keep their line breaks and a long list scrolls instead of stretching the row.
 */
export function DrNoText({ value }: { value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return <>—</>;
  return (
    <span className="block max-h-24 overflow-y-auto whitespace-pre-line break-words font-mono text-xs">
      {text}
    </span>
  );
}
