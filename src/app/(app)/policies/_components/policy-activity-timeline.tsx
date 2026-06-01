"use client";

const ACTION_LABELS: Record<string, string> = {
  submitted: "Submitted for review",
  approved: "Approved",
  reverted: "Reverted to draft",
  comment: "Comment",
};

interface ReviewEventRow {
  id: string;
  action: string;
  comment: string | null;
  createdAt: Date;
  userName: string;
}

interface PolicyActivityTimelineProps {
  events: ReviewEventRow[];
}

export function PolicyActivityTimeline({ events }: PolicyActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No review activity yet. Events appear when the policy is submitted, approved, or reverted.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {events.map((event) => (
        <li
          key={event.id}
          className="relative border-l-2 border-muted pl-4 pb-1 last:pb-0"
        >
          <p className="text-sm font-medium">
            {ACTION_LABELS[event.action] ?? event.action}
          </p>
          <p className="text-xs text-muted-foreground">
            {event.userName} · {new Date(event.createdAt).toLocaleString()}
          </p>
          {event.comment ? (
            <p className="mt-2 rounded-md bg-muted/50 p-3 text-sm">{event.comment}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
