import { readFileSync } from "node:fs";
import path from "node:path";

const sql = readFileSync(
  path.join(
    __dirname,
    "../../../prisma/migrations/20261123150000_custom_dashboard_permission_backfill/migration.sql",
  ),
  "utf8",
);

describe("custom dashboard permission backfill", () => {
  it("inserts the catalog rows the earlier grant migration assumed already existed", () => {
    expect(sql).toContain('INSERT INTO "permissions"');
    expect(sql).toContain("'dashboard.custom.view'");
    expect(sql).toContain("'dashboard.custom.manage'");
    expect(sql).toContain('ON CONFLICT ("slug") DO NOTHING');
  });

  it("grants both slugs only to customer-tenant Super Admin", () => {
    expect(sql).toContain('INSERT INTO "role_permissions"');
    expect(sql).toContain(`r."slug" = 'super_admin'`);
    expect(sql).toContain(`t."is_platform" = false`);
    expect(sql).toContain('ON CONFLICT ("role_id", "permission_id") DO NOTHING');
    expect(sql).not.toMatch(/slug" = '(?!super_admin')/);
  });
});
