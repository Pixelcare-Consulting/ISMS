import { createNotificationSchema } from "@/features/notifications/schemas/notification.schema";

const base = { type: "sap.changes.warehouse", title: "SAP has new data for Warehouses" };

describe("createNotificationSchema — PERMISSION audience", () => {
  it("accepts a PERMISSION notification with a permission key", () => {
    const result = createNotificationSchema.safeParse({
      ...base,
      audience: "PERMISSION",
      permissionKey: "warehouses.manage",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a PERMISSION notification without a permission key", () => {
    const result = createNotificationSchema.safeParse({ ...base, audience: "PERMISSION" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["permissionKey"]);
  });
});
