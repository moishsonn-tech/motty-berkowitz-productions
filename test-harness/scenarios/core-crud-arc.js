// Scenario: through the REAL UI, create a Location, a Contact, and a Project — then assert each
// row actually landed in the real (test) Supabase tables, not just that a success toast
// appeared. This is the regression test for review issues 1.4 (lazy-created fields never
// persisting) and 2.1 (invoice-number collisions) once those are fixed — re-run this after
// fixing either and confirm it still passes.
const marker = 'e2e-' + Date.now();

module.exports = {
  name: 'core-crud-arc',
  description: 'Create a Location, Contact, and Project through the real UI; assert each row lands in Supabase.',
  async run({ browser, appUrl, mintSession, signInPage, supabaseAdmin, watchPage, registerCleanup }) {
    const context = await browser.newContext();
    registerCleanup(() => context.close());
    const page = await context.newPage();
    watchPage(page);

    const session = await mintSession();
    await signInPage(page, session);
    await page.locator('[data-action="nav"][data-view="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    // --- Location ---
    const locationName = `${marker}-location`;
    await page.locator('[data-action="nav"][data-view="locations"]').click();
    await page.locator('[data-action="openModal"][data-modal="location"]').click();
    await page.locator('#f-name').fill(locationName);
    await page.locator('#f-addr').fill('1 Test St, Testville, NY');
    await page.locator('[data-action="saveLocation"]').click();
    await page.locator('.toast', { hasText: 'Location added' }).waitFor({ timeout: 10000 });
    registerCleanup(async () => {
      const { data } = await supabaseAdmin.from('locations').select('id').eq('name', locationName);
      for (const row of data || []) await supabaseAdmin.from('locations').delete().eq('id', row.id);
    });
    const { data: locRows, error: locErr } = await supabaseAdmin.from('locations').select('*').eq('name', locationName);
    if (locErr) throw new Error(`Supabase read failed for locations: ${locErr.message}`);
    if (!locRows || locRows.length !== 1) throw new Error(`Expected exactly 1 location row named "${locationName}", found ${locRows ? locRows.length : 0}.`);

    // --- Contact ---
    const contactName = `${marker}-contact`;
    await page.locator('[data-action="nav"][data-view="contacts"]').click();
    await page.locator('[data-action="openModal"][data-modal="contact"]').click();
    await page.locator('#f-name').fill(contactName);
    await page.locator('#f-role').fill('E2E Tester');
    await page.locator('#f-rate-amt').fill('100');
    await page.locator('[data-action="saveContact"]').click();
    await page.locator('.toast', { hasText: 'Person added' }).waitFor({ timeout: 10000 });
    registerCleanup(async () => {
      const { data } = await supabaseAdmin.from('contacts').select('id').eq('name', contactName);
      for (const row of data || []) await supabaseAdmin.from('contacts').delete().eq('id', row.id);
    });
    const { data: contactRows, error: contactErr } = await supabaseAdmin.from('contacts').select('*').eq('name', contactName);
    if (contactErr) throw new Error(`Supabase read failed for contacts: ${contactErr.message}`);
    if (!contactRows || contactRows.length !== 1) throw new Error(`Expected exactly 1 contact row named "${contactName}", found ${contactRows ? contactRows.length : 0}.`);
    if (contactRows[0].rate !== '$100/day') throw new Error(`Expected rate "$100/day", got "${contactRows[0].rate}".`);

    // --- Project ---
    const projectName = `${marker}-project`;
    await page.locator('[data-action="nav"][data-view="boards"]').click();
    await page.locator('[data-action="newProject"]').click();
    await page.locator('#f-name').fill(projectName);
    await page.locator('#f-client').fill('E2E Client');
    await page.locator('[data-action="saveProject"]').click();
    await page.locator('.toast', { hasText: 'Project created' }).waitFor({ timeout: 10000 });
    registerCleanup(async () => {
      const { data } = await supabaseAdmin.from('projects').select('id').eq('name', projectName);
      for (const row of data || []) await supabaseAdmin.from('projects').delete().eq('id', row.id);
    });
    const { data: projRows, error: projErr } = await supabaseAdmin.from('projects').select('*').eq('name', projectName);
    if (projErr) throw new Error(`Supabase read failed for projects: ${projErr.message}`);
    if (!projRows || projRows.length !== 1) throw new Error(`Expected exactly 1 project row named "${projectName}", found ${projRows ? projRows.length : 0}.`);
    if (!projRows[0].invoice) throw new Error('New project has no invoice — defaultInvoice() did not persist on creation.');
  },
};
