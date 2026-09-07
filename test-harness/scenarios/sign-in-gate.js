// Scenario: an unauthenticated visitor sees the sign-in screen (never the app); a real,
// Admin-API-minted session loads the real app. Covers the render()-gates-on-S.session path in
// frontend/index.html.
module.exports = {
  name: 'sign-in-gate',
  description: 'Unauthenticated visitor sees the sign-in screen; a minted real session loads the real app.',
  async run({ browser, appUrl, mintSession, signInPage, watchPage, registerCleanup }) {
    const context = await browser.newContext();
    registerCleanup(() => context.close());
    const page = await context.newPage();
    watchPage(page);

    await page.goto(appUrl);
    await page.locator('[data-action="send-magic-link"]').waitFor({ state: 'visible', timeout: 10000 });
    // Sanity check: the real app view (sidebar nav) must NOT be present pre-auth.
    if (await page.locator('[data-action="nav"][data-view="dashboard"]').count()) {
      throw new Error('Dashboard nav is present before sign-in — the auth gate is not actually gating.');
    }

    const session = await mintSession();
    await signInPage(page, session);

    await page.locator('[data-action="nav"][data-view="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
    const emailShown = await page.locator('.sidebar-account').innerText();
    if (!emailShown || !emailShown.includes('@')) {
      throw new Error(`Signed-in sidebar did not show an account email (got: "${emailShown}").`);
    }
  },
};
