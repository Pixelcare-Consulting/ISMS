import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import { seedBrsDemoData } from "./seed-brs";
import { seedCore } from "./seed-core";
import { resolveSeedProfile, type SeedProfile } from "./seed-data";
import { seedReasonStatusesForTenant } from "./seed-reason-status";

const prisma = createPrismaClient();

async function loadDemoContext() {
  const demoTenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!demoTenant) {
    throw new Error('Demo tenant not found. Run `pnpm run db:seed:core` first.');
  }

  const users = await prisma.user.findMany({
    where: { tenantId: demoTenant.id },
    select: { id: true, email: true },
  });

  const usersByEmail = Object.fromEntries(users.map((u) => [u.email, { id: u.id }]));
  return { demoTenant, usersByEmail };
}

async function runProfile(profile: SeedProfile) {
  const started = Date.now();

  if (profile === "core") {
    await seedCore(prisma);
    console.log(`Seed [core] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "status") {
    const { demoTenant } = await loadDemoContext();
    await seedReasonStatusesForTenant(prisma, demoTenant.id);
    console.log(`Seed [status] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "brs") {
    const { demoTenant, usersByEmail } = await loadDemoContext();
    const statusCodes = await seedReasonStatusesForTenant(prisma, demoTenant.id);
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail, statusCodes);
    console.log(`Seed [brs] done in ${Date.now() - started}ms`);
    return;
  }

  const { demoTenant, usersByEmail } = await seedCore(prisma);
  const statusCodes = await seedReasonStatusesForTenant(prisma, demoTenant.id);

  if (profile === "full") {
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail, statusCodes);
    console.log(
      `Seed [full] done in ${Date.now() - started}ms — core + status + BRS demo. See database/seed-users.md`,
    );
    return;
  }

  console.log(
    `Seed [minimal] done in ${Date.now() - started}ms — core + status. Run \`pnpm run db:seed:full\` for BRS demo data.`,
  );
}

async function main() {
  const profile = resolveSeedProfile();
  await runProfile(profile);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
