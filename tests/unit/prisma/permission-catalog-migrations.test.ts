import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PERMISSIONS } from "../../../prisma/seed-data";

/**
 * Client databases are never seeded, so a permission that exists only in
 * prisma/seed-data.ts never reaches them. Every catalog slug must be inserted by a migration.
 */
const migrationsDir = path.join(__dirname, "../../../prisma/migrations");

function slugsInsertedByMigrations(): Set<string> {
  const slugs = new Set<string>();
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sql = readFileSync(path.join(migrationsDir, entry.name, "migration.sql"), "utf8");
    for (const match of sql.matchAll(/'([a-z_]+(?:\.[a-z0-9_]+)+)'/g)) {
      slugs.add(match[1]);
    }
  }
  return slugs;
}

describe("permission catalog migrations", () => {
  it("has a migration for every permission in the seed catalog", () => {
    const migrated = slugsInsertedByMigrations();
    const missing = PERMISSIONS.map((permission) => permission.slug).filter(
      (slug) => !migrated.has(slug),
    );
    expect(missing).toEqual([]);
  });
});
