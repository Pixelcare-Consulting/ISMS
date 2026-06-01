export const BRS_PERMISSIONS = [
  { slug: "branches.manage", name: "Manage branches" },
  { slug: "master_data.manage", name: "Manage master data" },
  { slug: "aors.manage", name: "Manage areas of responsibility" },
  { slug: "inventory.view", name: "View inventory" },
  { slug: "inventory.manage", name: "Manage inventory status" },
  { slug: "orders.create", name: "Create branch orders" },
  { slug: "orders.approve", name: "Approve branch orders" },
  { slug: "orders.view", name: "View branch orders" },
  { slug: "logistics.manage", name: "Manage logistics transactions" },
  { slug: "sales.create", name: "Record branch sales" },
] as const;
