export type PixelcareAiTaskId =
  | "check-branch-stock"
  | "review-shelf-gaps"
  | "track-order"
  | "help-return"
  | "review-planning"
  | "pcount-status"
  | "monthly-sir-status";

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
      "Help me track an order. If one or more sales order numbers (SO#YYYY-MM-#####) are already in the message, call findOrderStatus immediately with those exact numbers and keep the #. Ask for the order number only when none was given. Say when a number is not found or outside access, and never invent a status.",
  },
  {
    id: "help-return",
    title: "Help with a return",
    description: "Explain how Returns / Replacement works and what to do next.",
    starterPrompt:
      "Help me with a return. Explain the Returns / Replacement workflow and point me to the right screens.",
  },
  {
    id: "review-planning",
    title: "Review planning & forecast",
    description:
      "See recent planning runs, coverage, allocation gaps, and draft suggested orders you can access.",
    starterPrompt:
      "Help me review planning and forecast linkage. Use the planning tools for runs, coverage, allocation gaps, and draft suggested orders — do not invent formulas.",
  },
  {
    id: "pcount-status",
    title: "Check P-Count status",
    description:
      "See open or recent physical count sessions for a branch you can access.",
    starterPrompt:
      "Help me check P-Count status. Use explainIsmsWorkflow for how it works if needed, then getPcountStatus for the Active branch or ask which branch.",
  },
  {
    id: "monthly-sir-status",
    title: "Check Monthly SIR",
    description:
      "See recent Monthly SIR requests and upload allowance for stores you can access.",
    starterPrompt:
      "Help me with Monthly SIR. Use explainIsmsWorkflow for the verified flow if needed, then listMonthlySirStatus for recent requests.",
  },
];
