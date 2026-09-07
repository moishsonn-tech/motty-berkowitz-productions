#!/usr/bin/env node
// Test harness entrypoint. Usage:
//   node run.js              — run every registered scenario
//   node run.js <name>       — run just one (see scenarios/index.js for names)
// Exits 0 if everything passed, 1 if anything failed, 2 for a bad invocation — so a Bash-driven
// AI loop can branch on the exit code directly without parsing output.
require('dotenv').config({ path: require('path').join(__dirname, '.env.test') });
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const serveModule = require('./serve');
const { mintTestSession, signInPage, requireEnv } = require('./auth');
const scenarios = require('./scenarios');

async function main() {
  const only = process.argv[2];
  const toRun = only ? scenarios.filter((s) => s.name === only) : scenarios;
  if (only && toRun.length === 0) {
    console.error(`No scenario named "${only}". Available: ${scenarios.map((s) => s.name).join(', ')}`);
    process.exit(2);
  }

  let server, browser;
  try {
    server = await serveModule.start();
  } catch (err) {
    console.error(`Could not start the local app server: ${err.message}`);
    process.exit(2);
  }
  const appUrl = `http://localhost:${server.address().port}/`;

  let supabaseAdmin;
  try {
    supabaseAdmin = createClient(requireEnv('TEST_SUPABASE_URL'), requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY'));
  } catch (err) {
    console.error(err.message);
    server.close();
    process.exit(2);
  }

  const resultsDir = path.join(__dirname, 'test-results');
  fs.mkdirSync(resultsDir, { recursive: true });

  browser = await chromium.launch();
  let allPassed = true;
  const summary = [];

  for (const scenario of toRun) {
    process.stdout.write(`\n▶ ${scenario.name} — ${scenario.description}\n`);
    const consoleErrors = [];
    const watchedPages = [];
    const cleanupFns = [];
    const startedAt = Date.now();

    const ctx = {
      browser,
      appUrl,
      supabaseAdmin,
      mintSession: mintTestSession,
      signInPage: (page, session) => signInPage(page, appUrl, session),
      registerCleanup: (fn) => cleanupFns.push(fn),
      watchPage: (page) => {
        watchedPages.push(page);
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
      },
    };

    try {
      await scenario.run(ctx);
      if (consoleErrors.length) {
        throw new Error(`Browser console reported ${consoleErrors.length} error(s): ${consoleErrors.join(' | ')}`);
      }
      const ms = Date.now() - startedAt;
      console.log(`  ✔ PASS (${ms}ms)`);
      summary.push({ name: scenario.name, ok: true });
    } catch (err) {
      allPassed = false;
      console.error(`  ✘ FAIL: ${err.message}`);
      summary.push({ name: scenario.name, ok: false, reason: err.message });
      for (const page of watchedPages) {
        try {
          const shotPath = path.join(resultsDir, `${scenario.name}-failure.png`);
          await page.screenshot({ path: shotPath });
          console.error(`    screenshot: ${shotPath}`);
          break; // one screenshot (first tracked page) is enough context for most failures
        } catch (_) { /* page may already be closed */ }
      }
    } finally {
      for (const fn of cleanupFns) {
        try { await fn(); } catch (cleanupErr) { console.error(`  (cleanup warning: ${cleanupErr.message})`); }
      }
    }
  }

  await browser.close();
  server.close();

  console.log('\n' + '─'.repeat(40));
  for (const r of summary) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.reason}`);
  console.log(allPassed ? '\nAll scenarios passed.' : '\nSome scenarios FAILED — see above.');
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Harness crashed before completing:', err);
  process.exit(1);
});
