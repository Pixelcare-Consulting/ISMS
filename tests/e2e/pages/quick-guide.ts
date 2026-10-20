import { expect, type Page } from "@playwright/test";

/**
 * Each page's first-visit "quick guide" modal (PageTutorialTrigger) auto-opens
 * from an effect shortly after hydration and, being a modal, hides the rest of
 * the page from the accessibility tree. Dismissal is kept per page in
 * localStorage, so a page not covered by auth.setup.ts still shows it once.
 * When it was already dismissed this just costs the short wait.
 */
export async function dismissQuickGuide(page: Page, { expected = false }: { expected?: boolean } = {}) {
  const quickGuide = page.getByRole("dialog", { name: /quick guide/i });
  if (expected) {
    await expect(quickGuide).toBeVisible();
  } else {
    await quickGuide.waitFor({ state: "visible", timeout: 1_500 }).catch(() => undefined);
  }
  if (await quickGuide.isVisible()) {
    await quickGuide.getByRole("button", { name: /got it/i }).click();
    await expect(quickGuide).toBeHidden();
  }
}
