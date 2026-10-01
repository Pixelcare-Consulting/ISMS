import { expect, test } from "../fixtures/test";

// No browser session needed — this is what Docker HEALTHCHECK and Traefik rely on.
test.use({ storageState: { cookies: [], origins: [] } });

test("GET /api/health reports ok when the database is reachable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
