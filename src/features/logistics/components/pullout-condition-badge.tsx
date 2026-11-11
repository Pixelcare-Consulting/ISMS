import type { PulloutConditionView } from "@/features/logistics/services/pullout-posting.planner";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

export function PulloutConditionBadge({ condition }: { condition: PulloutConditionView }) {
  switch (condition) {
    case "STK":
      return <StatusCodeBadge code="STK" name="STK" />;
    case "DEF":
      return <StatusCodeBadge code="DEF" name="DEF" />;
    case "Mixed":
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusCodeBadge code="STK" name="STK" />
          <StatusCodeBadge code="DEF" name="DEF" />
        </span>
      );
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}
