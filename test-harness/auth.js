// Mints a REAL Supabase session for the dedicated test user, without sending a real email —
// standard, non-mocked way to test Supabase-authed apps end-to-end (Admin API generates a
// magic-link token; a normal client exchanges it for a real access/refresh token pair, exactly
// like clicking the emailed link would). service_role key is used ONLY here, server-side.
require('dotenv').config({ path: require('path').join(__dirname, '.env.test') });
const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — copy .env.test.example to .env.test and fill it in.`);
  return v;
}

async function mintTestSession() {
  const url = requireEnv('TEST_SUPABASE_URL');
  const anonKey = requireEnv('TEST_SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY');
  const email = requireEnv('TEST_USER_EMAIL');

  const admin = createClient(url, serviceRoleKey);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`);
  const tokenHash = linkData.properties && linkData.properties.hashed_token;
  if (!tokenHash) throw new Error('generateLink did not return a hashed_token — Supabase API may have changed shape.');

  // A normal (anon-key) client exchanges the token, exactly as the app itself would after a
  // user clicks the real emailed link — this is the real verification path, not a shortcut
  // around it, just triggered without a human clicking an email.
  const anon = createClient(url, anonKey);
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (verifyErr) throw new Error(`verifyOtp failed: ${verifyErr.message}`);
  if (!verifyData.session) throw new Error('verifyOtp succeeded but returned no session.');

  return {
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
    user: verifyData.session.user,
  };
}

// Injects a real minted session into a Playwright page BEFORE the app's own sign-in check runs,
// via the app's own window.sb.auth.setSession() — never hand-crafts localStorage internals, so
// this stays correct across Supabase SDK versions.
async function signInPage(page, appUrl, session) {
  await page.goto(appUrl);
  await page.waitForFunction(() => typeof window.sb !== 'undefined');
  await page.evaluate(async (s) => {
    const { error } = await window.sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    if (error) throw new Error('setSession failed: ' + error.message);
  }, session);
  await page.reload();
}

module.exports = { mintTestSession, signInPage, requireEnv };
