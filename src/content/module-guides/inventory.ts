import type { ModuleGuideContent } from "@/content/module-guides/types";

export const INVENTORY_MODULE_GUIDE: ModuleGuideContent = {
  title: "Stock units",
  description:
    "Serialized branch stock scoped by your areas of responsibility. Look up units, spot off-planogram exceptions, and open a serial for detail.",
  /** Kept for Help. Stock units renders status counts in the guide instead of these chips. */
  tips: [
    {
      label:
        "All serials lists stock, display units, and defective units. Sold, reserved, and in-transit units stay in Sales and Logistics",
    },
    {
      label:
        "Change stock to a display unit right away, or put a display unit back to stock. Display units are not counted as stock you can sell",
    },
    {
      label:
        "Marking a unit defective asks for the problem and waits for that branch’s team leader. The unit stays as it is until they approve. A defective unit cannot be changed here",
    },
    { label: "Series summary and the stock count still count stock only" },
    { label: "Series summary groups QTY and value by the model's series — click to expand" },
    {
      label:
        "To validate order STK, use By model here or Reports → Inventory Report (SKU / status / branch filters + Excel Summary and Detail tabs) — All serials is AOR-wide, not one branch",
    },
    { label: "Off planogram means the SKU is not on that branch’s authorized list" },
    { label: "Search by serial, SKU, or branch" },
    { label: "Warehouse serials are under Inventory → Warehouse stock (not this list)" },
  ],
  storageKey: "module-guide.inventory",
};
