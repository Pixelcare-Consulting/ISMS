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
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-700">
          Mixed
        </span>
      );
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}
