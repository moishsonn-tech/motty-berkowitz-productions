// Scenario: two independent browser sessions (two Playwright contexts, same test user — mirrors
// two devices/tabs a real user might have open) see the SAME data converge over Supabase
// Realtime, without a manual reload. Targets review issues 1.1 (double-subscribe race) and 1.5
// (whole-row save / last-write-wins) territory — the newest, highest-risk code from the Supabase
// migration.
const marker = 'e2e-sync-' + Date.now();

module.exports = {
  name: 'realtime-sync',
  description: 'An edit made in one signed-in session shows up in a second signed-in session without a reload.',
  async run({ browser, appUrl, mintSession, signInPage, supabaseAdmin, watchPage, registerCleanup }) {
    const session = await mintSession(); // same test user in both contexts, like two open tabs

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    registerCleanup(() => contextA.close());
    registerCleanup(() => contextB.close());
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    watchPage(pageA);
    watchPage(pageB);

    await signInPage(pageA, session);
    await signInPage(pageB, session);
    await pageA.locator('[data-action="nav"][data-view="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
    await pageB.locator('[data-action="nav"][data-view="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    // Both land on Locations so B is already subscribed/rendering when A creates the row.
    await pageA.locator('[data-action="nav"][data-view="locations"]').click();
    await pageB.locator('[data-action="nav"][data-view="locations"]').click();

    const locationName = `${marker}-location`;
    registerCleanup(async () => {
      const { data } = await supabaseAdmin.from('locations').select('id').eq('name', locationName);
      for (const row of data || []) await supabaseAdmin.from('locations').delete().eq('id', row.id);
    });

    await pageA.locator('[data-action="openModal"][data-modal="location"]').click();
    await pageA.locator('#f-name').fill(locationName);
    await pageA.locator('#f-addr').fill('1 Realtime Ave, Testville, NY');
    await pageA.locator('[data-action="saveLocation"]').click();
    await pageA.locator('.toast', { hasText: 'Location added' }).waitFor({ timeout: 10000 });

    // No reload on B — realtime must push this through on its own.
    await pageB.locator('.loc-name', { hasText: locationName }).waitFor({ timeout: 15000 })
      .catch(() => { throw new Error(`Session B never saw "${locationName}" appear via realtime within 15s.`); });
  },
};
