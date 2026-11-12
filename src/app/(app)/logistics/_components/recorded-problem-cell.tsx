/** Read-only: the problem recorded on the unit's defect tag or sales return, when there is one. */
export function RecordedProblemCell({ problem }: { problem: string | null }) {
  if (!problem) return <span className="text-muted-foreground">None recorded</span>;
  return (
    <p className="line-clamp-3 break-words" title={problem}>
      {problem}
    </p>
  );
}
