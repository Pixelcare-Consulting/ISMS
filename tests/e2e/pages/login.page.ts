import { expect, type Locator, type Page } from "@playwright/test";

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;
  /** App throttle (5 per IP+email / 5 min) or Better Auth's built-in limiter. */
  readonly rateLimited: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByRole("textbox", { name: "Email" });
    this.password = page.getByRole("textbox", { name: "Password" });
    this.submit = page.getByRole("button", { name: /sign in/i });
    this.error = page.getByText(/invalid email or password/i);
    this.rateLimited = page.getByText(/too many (login attempts|requests)/i);
  }

  async goto(callbackUrl?: string) {
    const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
    await this.page.goto(`/login${query}`);
    await expect(this.submit).toBeVisible();
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** Sign in and wait for the full-document navigation the form performs. */
  async loginAndWait(email: string, password: string, expectedPath: RegExp = /\/(dashboard|provider)/) {
    await this.login(email, password);
    // Fail fast with a clear message instead of a 30 s URL timeout.
    await expect(this.rateLimited, `sign-in for ${email} is rate-limited; wait 5 min or restart the app`).toBeHidden();
    await this.page.waitForURL(expectedPath);
  }
}
