export type PixelcareAiTaskId =
  | "check-branch-stock"
  | "review-shelf-gaps"
  | "track-order"
  | "help-return"
  | "review-planning";

export interface PixelcareAiTask {
  id: PixelcareAiTaskId;
  title: string;
  description: string;
  starterPrompt: string;
}

export const PIXELCARE_AI_TASKS: PixelcareAiTask[] = [
  {
    id: "check-branch-stock",
    title: "Check branch stock",
    description: "See sellable units on hand for a branch you can access.",
    starterPrompt:
      "Help me check branch stock. Ask which branch if needed, then use the stock tool.",
  },
  {
    id: "review-shelf-gaps",
    title: "Review shelf gaps",
    description: "Review planogram shelf max vs STK and the suggested gap (SUG).",
    starterPrompt:
      "Help me review shelf gaps. Ask which branch if needed, then explain max, STK, and SUG from the app.",
  },
  {
    id: "track-order",
    title: "Track an order",
    description: "Look up order status and next steps for orders you can see.",
    starterPrompt:
      "Help me track an order. Ask for the order number if needed, then look up status.",
  },
  {
    id: "help-return",
    title: "Help with a return",
    description: "Explain how Returns / Replacement works from verified Help guides.",
    starterPrompt:
      "Help me with a return. Explain the Returns / Replacement workflow from verified Help only.",
  },
  {
    id: "review-planning",
    title: "Review planning & forecast",
    description:
      "See recent planning runs, coverage, allocation gaps, and draft suggested orders you can access.",
    starterPrompt:
      "Help me review planning and forecast linkage. Use the planning tools for runs, coverage, allocation gaps, and draft suggested orders — do not invent formulas.",
  },
];
