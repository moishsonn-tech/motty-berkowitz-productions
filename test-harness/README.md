# Test harness — real-user end-to-end verification

This drives the **real** app (real browser, real Supabase project, real data) exactly the way a
person would — no mocks, no simulated network responses, no unit tests standing in for the real
thing. It exists so an AI-code session can verify its own work against the real world from one
shell command and loop until green, without depending on a live interactive browser-tool
connection (which can drop).

## Setup (one-time)
1. `cd test-harness && npm install`
2. `npx playwright install chromium` (downloads a pinned Chromium build)
3. Copy `.env.test.example` → `.env.test` and fill in a **dedicated test Supabase project's**
   values (never the production project — see the security note below).
4. In that test project's SQL editor, run `../supabase/schema.sql` then `../supabase/policies.sql`,
   then bootstrap the one test user: `insert into allowed_emails (email, added_by) values
   ('<TEST_USER_EMAIL from your .env.test>', 'test-harness');`

## Running it
- `npm test` — run every registered scenario.
- `npm test -- <scenario-name>` — run just one (see the registry table below for names).
- `npm run serve` — just start the local static server for `frontend/` (useful for manually
  poking at the app in a real browser against the test project, outside the harness).

Exit code is `0` if everything passed, `1` if anything failed, `2` for a setup/invocation problem
(missing env var, no scenario with that name, etc.) — branch on this directly in a script or an
AI session's own loop rather than parsing output text.

On a failure, a screenshot lands in `test-harness/test-results/<scenario>-failure.png` and the
console error (if any) is included in the printed reason.

## Registry of available scenarios (SSOT — this table IS the source of truth for what's covered)

| Name | File | Covers | Asserts |
|---|---|---|---|
| `sign-in-gate` | `scenarios/sign-in-gate.js` | Auth gate (`render()`'s `S.session` check) | Unauthenticated visitor sees the sign-in screen, never the app; a minted real session loads the real app with the account email shown in the sidebar. |
| `core-crud-arc` | `scenarios/core-crud-arc.js` | Locations, Cast & Crew, Projects creation | Each entity created through the real UI actually lands in the corresponding Supabase table (not just "the toast said success"); a new project's invoice is actually persisted, not just held in memory. |
| `realtime-sync` | `scenarios/realtime-sync.js` | Supabase Realtime sync across sessions | An edit made in one signed-in browser context appears in a second signed-in context without a reload, within 15s. |

A new scenario is added to this table **in the same commit** that adds its file and registers it
in `scenarios/index.js` — if it's not in both places, it doesn't count as covered.

## Writing a new scenario
Copy the shape of an existing scenario file. Each one exports `{ name, description, async
run(ctx) }`, where `ctx` gives you:
- `browser` — the shared Playwright browser; call `browser.newContext()` for an isolated session
  (one per "device"/tab you need — see `realtime-sync.js` for a two-context example).
- `appUrl` — the local server URL serving the real `frontend/`.
- `mintSession()` — returns a real Supabase session for the one dedicated test user (no email
  involved — see `auth.js`).
- `signInPage(page, session)` — navigates a page and signs it in with a minted session.
- `supabaseAdmin` — a service-role Supabase client, for asserting real DB state directly (bypasses
  RLS on purpose — this is how you check "did it actually save," not just "did the UI look right").
- `watchPage(page)` — call this on every page you create; it captures console errors/exceptions
  (a scenario that produces any is failed automatically, even if every assertion otherwise
  passed) and makes the page eligible for an automatic failure screenshot.
- `registerCleanup(fn)` — register an async cleanup function (e.g. delete the row you created).
  Runs after every scenario, pass or fail. **Every scenario that creates data must register
  cleanup for it** — the test project should never accumulate orphan rows.

Conventions to follow (don't invent new ones):
- **Select elements by `data-action`/`data-modal`/`data-view` attributes**, exactly like the
  app's own event delegation does — never by visible text or CSS class, which drift with UI
  copy/styling changes that don't actually break anything.
- **Assert against real Supabase state** (`supabaseAdmin.from(...).select(...)`) for anything
  that's supposed to persist — a passing UI-only check that the data never actually saved is
  worse than no check, it's false confidence.
- **Prefix any data you create with a unique marker** (see `e2e-` + `Date.now()` in the existing
  scenarios) so cleanup can find it precisely and a failed run's leftovers are obviously
  test-harness debris, not real data, if cleanup itself fails.

## Security
The `service_role` key in `.env.test` bypasses Row Level Security entirely — treat it as a crown
jewel (per `CLAUDE.md`'s Security section). It is read only by `auth.js` and `run.js`, server-side
in Node, and is never sent to a browser page, logged, or printed. `.env.test` is gitignored;
never commit it, never paste its contents anywhere outside your own `.env.test` file.

## Deliberately not built yet (logged here so it isn't reinvented or forgotten)
- **Passkey-specific coverage** — Playwright 1.61+ has a real (non-mocked) virtual WebAuthn
  authenticator (`browserContext.credentials`) that could drive the actual Register/Sign-in-with-
  passkey flow in Settings. Worth adding if that flow needs its own regression coverage.
- **CI integration** — turning `npm test` into a required GitHub Actions check before
  `.github/workflows/pages.yml` deploys. Straightforward once this has proven itself locally.
- **Broader feature coverage** — Script/Shot List editing, Financials edge cases, Call Sheet rich
  text, Schedule conflict detection, Kosher Spots. Add scenarios incrementally as those areas see
  real bugs or real risk, following the convention above — don't front-load coverage nothing has
  asked for yet.
