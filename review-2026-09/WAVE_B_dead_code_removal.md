# Wave B — Dead code removal (paste this whole thing into a fresh Claude Code session)

You're working in the repo `motty-berkowitz-productions` (a single-author video-production PM
tool for Motty Berkowitz — vanilla-JS/no-build frontend, Supabase backend). Start by reading
`CLAUDE.md` in full for this kit's conventions. Also skim `CODEBASE_REVIEW.md` in the repo root
for the full context behind this work (a prior codebase-review pass); the items below are IDs
4.3, 4.4, 3.2, 6.2(partial), and 6.1(now resolved) from that review.

This is pure deletion of confirmed-dead code — near-zero risk, but still verify nothing
references what you remove before deleting it (grep first), and still test the app loads and
works after each deletion.

## 1. Remove the dead `ADMIN_EMAILS` placeholder in `backend/proxy.js`
`ADMIN_EMAILS = ['<you@company.com>']` (near the top of proxy.js) is never read anywhere —
`verifyIdToken` doesn't reference it, nothing else does. It's leftover starter-kit boilerplate
that implies a backend-side admin tier that doesn't exist; the real (and entirely separate)
access-control model for this app is the Supabase `allowed_emails` table. Grep the whole repo
for `ADMIN_EMAILS` to confirm zero other references, then delete the line.

## 2. Remove the dead encryption-at-rest scaffolding in `backend/proxy.js`
`loadST()`, `saveST()`, `STATE_FILE`, `STATE_KEY_FILE`, and the module-level `ST` variable are
assigned once (`let ST = loadST()`) and never read or written by either of the two actual routes
(`/api/claude`, `/api/location-photo`) — dead now that Supabase owns all app data. Grep for `ST`,
`loadST`, `saveST`, `STATE_FILE`, `STATE_KEY_FILE` to confirm nothing else in the file (or repo)
depends on them, then remove the functions/constants and the `getStateKey`/crypto-related helper
functions they exclusively depend on if those also become unused. Leave the actual route handlers
and the AES-256-GCM pattern itself alone if it's referenced anywhere else — this is specifically
about removing the now-orphaned STATE_FILE persistence path, not about removing encryption
capability in general if something else in the file still needs it (check first).

## 3. Remove dead CSS from superseded designs in `frontend/index.html`
Confirm via grep (search the markup-producing JS, not just other CSS) that each of these has
zero live usage, then delete the CSS rules:
- `.stat-row`, `.stat-tile.flagship`, `.stat-tile.flag` — the dashboard's old 4-tile "bento" stat
  row. The dashboard currently renders a single plain `.stat-tile` with no wrapper/modifier class.
- `.proj-title`, `.proj-sub` — superseded by `.proj-title-input`/`.proj-sub-input`/
  `.proj-sub-select` when the project header became inline-editable.
- `.cs-kosher-row` — superseded when the Call Sheet became a free-form contenteditable doc using
  plain `<ul><li>` markup instead of generated rows.
- While you're in there, also check `.day-group`/`.day-label` for the same dead-CSS pattern (the
  review flagged these as "likely also dead" but wasn't fully certain) — grep to confirm before
  removing.

Separately (documentation, not code): CLAUDE.md's "UI aesthetic" section still describes the
bento/flagship stat-tile layout as a pattern for this app. Use your judgment on whether that's
meant as general reusable kit guidance (fine to leave, since CLAUDE.md is shared across the
owner's other projects) vs. a claim that THIS app's dashboard currently uses it (which would be
false and should be corrected/removed) — read the surrounding context in CLAUDE.md and decide;
if genuinely ambiguous, ask the user rather than guessing.

## 4. Remove the broken service-worker registration
`frontend/index.html` has `if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});`
but there is no `frontend/sw.js` in the repo — the registration always fails, silently, due to
the empty `.catch()`. `frontend/manifest.json` still implies PWA/installability, which is
separate and fine to keep (the manifest doesn't require a service worker to provide "Add to
Home Screen" — just remove the specific broken registration line, don't touch manifest.json).
Do NOT build a real service worker as part of this wave — that's a separate, bigger decision
(offline support) the user explicitly deferred. Just remove the dead line so it stops being
misleading.

## 5. Remove `deploy/deploy-index.js` (frontend SFTP deploy script) — now confirmed dead
The user confirmed GitHub Pages (`.github/workflows/pages.yml`, auto-deploys `frontend/` on
push to `main`) is the actual live deploy mechanism for the frontend — `deploy/deploy-index.js`
(SFTP-based) is leftover kit boilerplate for THIS project's frontend specifically. Remove
`deploy/deploy-index.js`. Do NOT touch `deploy/deploy-proxy.js` — that's still the only way to
deploy the backend (`backend/proxy.js`), since GitHub Pages can't host a live Node process.
Update CLAUDE.md's "Deploy discipline" section (and the "What this is" section's "Deploy = SFTP
a single file up" line) to accurately reflect: frontend deploys automatically via GitHub Pages
on push to main (no manual step); backend still deploys via SFTP (`deploy/deploy-proxy.js`) and
the existing "Deploy discipline" hot-patch/backup rules still apply there.

## When you're done
- Grep one more time across the whole repo for anything you removed, to be sure nothing broke.
- Load the app in a browser (local static server for `frontend/`) and confirm it still works —
  dashboard loads, sign-in screen shows, no new console errors.
- Report what you removed and what you verified, honestly.
- Ask before committing/pushing, per this repo's normal git workflow.
