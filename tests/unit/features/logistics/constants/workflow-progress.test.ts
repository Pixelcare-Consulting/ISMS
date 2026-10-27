import { buildCatalogProgress } from "@/features/logistics/constants/workflow-progress";
import {
  DELIVERY_SETTLED_CODES,
  DELIVERY_STOP_CODES,
  DELIVERY_WORKFLOW_CODE,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";

function option(
  code: string,
  name: string,
  sortOrder: number,
  color: string | null = "slate",
): WorkflowStatusOption {
  return { code, name, sortOrder, color };
}

const deliveryCatalog: WorkflowStatusOption[] = [
  option(DELIVERY_WORKFLOW_CODE.requested, "Requested", 1, "sky"),
  option(DELIVERY_WORKFLOW_CODE.approved, "Cleared", 2, "emerald"),
  option(DELIVERY_WORKFLOW_CODE.pending, "Waiting at the branch", 3, "amber"),
  option(DELIVERY_WORKFLOW_CODE.accepted, "Taken in", 4, "emerald"),
  option(DELIVERY_WORKFLOW_CODE.rejected, "Declined", 5, "rose"),
  option("HOLD", "On hold", 6, "violet"),
];

describe("buildCatalogProgress", () => {
  it("uses the saved name, color, and order, including a code that was added", () => {
    const nodes = buildCatalogProgress({
      catalog: deliveryCatalog,
      status: { code: "pending", name: "Waiting at the branch", color: "amber" },
      stopCodes: DELIVERY_STOP_CODES,
      settledCodes: DELIVERY_SETTLED_CODES,
      icons: {},
      occurredAt: () => null,
      eventsFor: () => [],
      stopAt: null,
      stopEvents: [],
    });

    expect(nodes.map((node) => node.label)).toEqual([
      "Requested",
      "Cleared",
      "Waiting at the branch",
      "Taken in",
      "On hold",
    ]);
    expect(nodes.map((node) => node.state)).toEqual([
      "completed",
      "completed",
      "current",
      "upcoming",
      "upcoming",
    ]);
    expect(nodes[2]?.color).toBe("amber");
  });

  it("drops a deactivated code and stops on the saved rejected name", () => {
    const withoutPending = deliveryCatalog.filter((row) => row.code !== "pending");
    const nodes = buildCatalogProgress({
      catalog: withoutPending,
      status: { code: "rejected", name: "Declined", color: "rose" },
      stopCodes: DELIVERY_STOP_CODES,
      settledCodes: DELIVERY_SETTLED_CODES,
      icons: {},
      occurredAt: (code) =>
        code === "requested" || code === "approved" ? "2026-10-26T00:00:00.000Z" : null,
      eventsFor: () => [],
      stopAt: "2026-10-26T01:00:00.000Z",
      stopEvents: [],
    });

    expect(nodes.map((node) => node.label)).toEqual([
      "Requested",
      "Cleared",
      "Declined",
      "Taken in",
      "On hold",
    ]);
    expect(nodes.find((node) => node.label === "Declined")).toMatchObject({
      state: "cancelled",
      color: "rose",
    });
    expect(nodes.some((node) => node.key === "pending")).toBe(false);
  });

  it("keeps a code that is no longer active as the current step", () => {
    const nodes = buildCatalogProgress({
      catalog: deliveryCatalog.filter((row) => row.code !== "pending"),
      status: { code: "pending", name: "Waiting at the branch", color: "amber" },
      stopCodes: DELIVERY_STOP_CODES,
      settledCodes: DELIVERY_SETTLED_CODES,
      icons: {},
      occurredAt: () => null,
      eventsFor: () => [],
      stopAt: null,
      stopEvents: [],
    });

    expect(nodes[0]).toMatchObject({
      key: "pending",
      label: "Waiting at the branch",
      state: "current",
      color: "amber",
    });
    expect(nodes.slice(1).every((node) => node.state === "upcoming")).toBe(true);
  });
});
