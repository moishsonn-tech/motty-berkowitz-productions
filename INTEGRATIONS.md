# Integrations Catalog — every option, with the proven picks marked

> How to wire ANY third-party capability into a kit-style app. Entries marked **✓ proven** have
> been used in production by the owner and are the default choice; alternatives are listed for
> when the default doesn't fit. Everything with a secret key goes through the proxy — never the
> browser. Read the relevant section BEFORE adding an integration; the gotchas here were paid for.

---

## 1. Email — SENDING (alerts, reports, receipts)
The #1 lesson: **cloud VPS providers (DigitalOcean and most others) block outbound SMTP ports
(25/465/587)** — a droplet cannot send classic SMTP mail. Send over HTTPS instead, or from a
machine that isn't port-blocked (e.g. a local Windows box).

- **✓ proven — Google Apps Script mail relay (for servers):** a tiny Apps Script web app in the
  owner's Google account exposes a URL+secret; the server POSTs over HTTPS 443 and the script
  calls `MailApp.sendEmail`. Free, ~1,500 mails/day, rides the owner's Gmail identity.
  Gotcha: a `302` response IS success (Apps Script redirects). Keep the URL+secret in a
  `chmod 600` file outside the git dir.
- **✓ proven — Gmail SMTP with an app password (for local/non-blocked machines):** requires
  2-Step Verification ON for the Google account first (app passwords are hidden until 2SV is
  enabled). Vanilla-Node SMTP client, no deps. Store creds in a gitignored config file.
- **✓ proven — EmailJS: FALLBACK ONLY.** Free tier quota (~200/mo) exhausts silently and takes
  every report that shares the account down with it. Never make it the primary channel.
- **✓ proven — fallback chain + local last resort:** order sends as
  `HTTPS relay → SMTP → EmailJS`, and on total failure write the report to a local HTML file and
  open it so the run is never silently lost.
- Alternatives at scale / for product email: **Resend, Postmark, SendGrid, Amazon SES** — real
  transactional providers with HTTPS APIs (work from any server), deliverability tooling, and
  per-mail pricing. Step up when volume, custom From-domains (SPF/DKIM), or open-tracking matter.

## 2. Email — READING (inboxes, attachments)
- **✓ proven — Gmail MCP** (Claude Code connector) for searching/reading messages and threads.
- **✓ proven — attachments workaround:** Gmail MCP cannot download attachments. Use browser
  automation on the owner's logged-in Google session: read the `download_url` attributes from the
  message DOM, then `fetch(url, {credentials: 'include'})` in page context.
- Alternatives: Gmail REST API with OAuth (proper but heavyweight setup); IMAP (blocked by the
  same 2SV/app-password requirements as SMTP).

## 3. Payments
- **✓ explored & designed — Stripe** is the default for anything payment-shaped:
  - Cards / Apple Pay / Google Pay: **2.9% + $0.30 per transaction.** The $0.30 fixed fee means
    small transactions lose to percentage-fee competitors — do the break-even math for your
    average ticket before committing.
  - **ACH debit: 0.8% capped at $5** — hugely cheaper for invoicing recurring/B2B accounts.
  - **Stripe Checkout / Payment Links:** hosted payment page, near-zero backend code — the
    fastest path to "scan a QR code → pay" (QR encodes the link; no app install for the payer).
  - **Stripe Connect:** when running a platform that takes a cut and pays out clients — Connect
    handles the fee-skim + payouts + their tax paperwork.
- Alternatives: Square (in-person/terminal focus), PayPal/Venmo (consumer familiarity), plain
  invoicing. Default to Stripe unless there's a concrete reason.

## 4. Auth & identity
- **✓ proven — Google Identity Services ID token:** client signs in with Google; EVERY `/api/*`
  request carries the ID token; the proxy verifies signature, issuer, audience, expiry, and an
  email **allowlist** (plus an admin flag for privileged routes). This is the real boundary.
- **✓ proven anti-pattern — client-side PIN gates are theater.** Fine as a convenience screen,
  never as authorization.
- Alternatives: magic email links (needs sending infra from §1); Firebase Auth (more providers,
  more surface). For internal tools, Google ID token + allowlist wins on effort-to-security ratio
  when everyone already has a Google account (e.g. company Workspace).
- **Passkeys/WebAuthn** — step up from Google ID token when: users don't share one identity
  provider, or the product is public-facing and password/OAuth friction matters. Best UX+security
  available (device biometric/PIN, phishing-resistant, no shared secret to leak), more
  implementation work than ID-token verification (needs a WebAuthn library server-side —
  `@simplewebauthn/server` is the standard pick — to handle registration/assertion ceremonies and
  store per-user public keys). Pairs naturally with Supabase Auth below, which has built-in
  WebAuthn support and removes the need to hand-roll the ceremony.

## 5. Data & storage
- **✓ proven — Firestore via REST** from the client with a public Web API key — security lives in
  Firestore RULES, not key secrecy. Last-write-wins blobs; per-record `_t` timestamp sync.
  **This is the DEFAULT database for kit-style apps** — it's the rare DB a static frontend can
  talk to directly and safely, with zero servers to maintain and a free tier (50k reads/20k
  writes/day) internal tools never exhaust.
  - **New-project recipe (~15 min, no card needed):** console.firebase.google.com → Add project →
    Build → Firestore → Create database (production mode) → Rules tab: paste locked-down rules
    (deny all by default; allow only `request.auth.token.email in [allowlist]` per collection) →
    Project settings → copy the web config block into the frontend. Enable Google sign-in under
    Authentication if using ID-token auth (§4).
  - Known limits (fine at internal-tool scale): no joins/server-side aggregations — fetch and
    compute in the browser; last-write-wins clobbers concurrent edits to the same record; Google
    lock-in. If a tool becomes reporting-heavy, **Supabase** is the step-up.
  - Skip Firestore entirely when the data is server-side anyway (devices/webhooks hitting the
    proxy, not browsers) — use SQLite or JSON files on the droplet instead.
- **✓ proven step-up — Supabase** (Postgres + built-in auth + storage, one service): same
  browser-direct + rules model as Firestore, but the rules ARE real SQL — **Row Level Security
  (RLS) policies** on the table, not a separate rules DSL. Reach for this over Firestore default
  when the app needs real cross-record reporting/joins (financials, multi-entity rollups) — that's
  a rewrite in Firestore's document model but a `JOIN` in Postgres.
  - **RLS is the actual security boundary and is OFF by default per table** — a fresh Supabase
    table with RLS disabled is world-readable/writable to anyone holding the public anon key. Turn
    it on and write an explicit policy (e.g. `USING (auth.uid() = user_id)`) before any table goes
    live; never ship a table with RLS disabled "temporarily."
  - Supabase Auth supports **passkeys/WebAuthn natively** (see §4) plus Google/email — worth
    using over hand-rolling ID-token verification when already on Supabase, since session
    handling and the WebAuthn ceremony are built in.
  - Free tier covers internal-tool scale (500MB DB, 50k monthly active users). Client talks to
    Postgres via Supabase's auto-generated REST (PostgREST) or JS client — no proxy needed for
    reads/writes RLS already authorizes, same "zero servers" shape as the Firestore default.
  - **New-project recipe (~15 min, no card needed):** supabase.com → New project → note the
    project URL + anon public key → Table Editor: create tables → for EACH table, Authentication
    toggle "Enable RLS" (on by default for new tables, but verify) → SQL Editor: add policies,
    e.g. `create policy "own rows" on bookings for select using (auth.uid() = owner_id);` (repeat
    per operation: select/insert/update/delete — a table with RLS on and zero policies denies
    everything, which is the safe failure mode while policies are still being written) →
    Authentication → Providers: enable Google and/or passkeys → copy the URL + anon key into the
    frontend (the anon key is meant to be public; RLS is what makes that safe).
  - Passkey recipe once on Supabase: Authentication → Providers → enable "Web Authn" — Supabase
    hosts the registration/assertion ceremony, so no `@simplewebauthn/server` or custom proxy
    routes needed; the frontend just calls `supabase.auth.signInWithWebAuthn()`-equivalent from
    their JS client. This is the fast path to "no Google login" — skip §4's Google ID-token
    pattern entirely and use Supabase Auth (passkey or email) as the single identity provider.
- **✓ proven — localStorage** for per-user local-only state (an app whose data never leaves the
  browser can even ship on a public URL with no auth — nothing server-side to protect).
- **✓ proven — JSON files on the droplet** for server-side state the proxy owns (baselines,
  caches, tokens). Keep secret-bearing files outside the git dir, `chmod 600`.
- Alternatives: SQLite (first choice if the no-deps rule is ever relaxed and data gets
  relational); Postgres (managed, when multi-writer or real queries arrive); Google Sheets as a
  human-editable "database" (via Apps Script or service account — good for data non-devs maintain).
- Files/blobs: **Google Drive via the proxy** (proven pattern) or S3-compatible object storage
  (DO Spaces) when files outgrow Drive.

## 6. Maps, geocoding & satellite imagery
- **✓ proven — Leaflet + Esri World Imagery tiles:** free, KEYLESS satellite basemap — the whole
  to-scale site-canvas pattern (draw real-world-sized objects on satellite imagery) runs on it.
- **✓ proven — Nominatim (OpenStreetMap) geocoding:** free, keyless address search. Respect the
  ~1 req/sec usage policy; fine for interactive lookups, not bulk jobs.
- Alternatives: OSM street tiles (free, keyless); Mapbox (prettier, needs key + free-tier
  limits); Google Maps/Geocoding (best data, needs billing-enabled key — route through the proxy).
- Gotcha: loading Leaflet from a CDN (unpkg) works but is a third-party runtime dependency —
  self-host the two files for anything long-lived.

## 7. Browser automation (Playwright)
For portals with no API, scheduled scrapes, and anything a human would click through.
- **✓ proven — interactive:** Playwright MCP in a Claude session, riding the owner's real
  logged-in browser profile.
- **✓ proven — scheduled/headless jobs:** `playwright-core` scripts. Key tricks:
  - **Bot-detection (Akamai etc.) blocks headless Chrome.** Launch HEADED but park the window
    off-screen at `(-32000,-32000)` — invisible to the user, real-Chrome to the detector.
  - **Dedicated persisted profile per job** (copy a profile that already holds a live login).
    Sessions on modern portals often long-outlive the nominal token expiry (server-side refresh),
    so a seeded profile can run for weeks.
  - **Call the portal's own GraphQL/REST from page context** (`page.evaluate` + `fetch` with
    `credentials:'include'`) instead of clicking through UI — you ride the app's session and get
    clean JSON.
  - **Re-login flow:** when the session finally dies, don't fail silently — email the owner
    instructions plus a one-click `relogin.cmd` that opens the profile headed for manual MFA.
- Alternatives: raw HTTP with a captured bearer token (lighter, when the token is long-lived);
  official APIs whenever they exist.

## 8. Scheduled jobs & background work
- **✓ proven — Windows Task Scheduler** for jobs tied to the owner's PC (browser profiles live
  there): weekly trigger + `StartWhenAvailable` so a closed laptop runs it at next wake.
- **✓ proven — PM2 on the droplet** for always-on services (`pm2 start … --name x`), and
  `pm2 start --cron` / crontab for server-side schedules.
- Design rules: every scheduled job diffs against a **baseline file** (state lives in JSON next
  to the script), reports via the §1 email chain, and NEVER fails silently — the local-HTML
  fallback or an error email always fires.
- Alternatives: GitHub Actions cron (free, no machine needed — for jobs with no local
  profile/secrets), Claude Code scheduled routines (when the job needs judgment, not just code).

## 9. LLM / AI
- **✓ proven — Anthropic API via the proxy** (`ANTHROPIC_KEY` server-side only; the browser calls
  `/api/…`, the proxy injects the key). Never ship an LLM key to the client.
- Use the latest models; check current ids/pricing at build time rather than hardcoding old ones.

## 10. Realtime, hardware & push
- **✓ proven — Web Push** (service worker + VAPID keys) for alerting without email/SMS — pairs
  naturally with the kit's PWA shape.
- **✓ designed — WebSockets behind nginx:** add a `wss://` route (nginx `Upgrade` headers) to the
  existing droplet — this is how device protocols like **OCPP** (EV chargers) terminate. The
  droplet+PM2+nginx stack handles persistent sockets fine; no new infra needed.
- Hardware/vehicle/financial control APIs: crown-jewel rules from CLAUDE.md §Security apply
  (server-only encrypted keys, admin-gated, audit-logged, explicit confirmation to actuate).

## 11. SMS & phone
- Reading OTPs/2FA texts: **✓ proven** via the owner's VoIP portal (e.g. RingCentral web) with
  browser automation — no SMS API needed.
- Sending SMS: **Twilio** (or the VoIP provider's API) — only when push (§10) and email (§1)
  genuinely can't reach the audience; SMS costs per message and adds compliance overhead.

## 12. Documents & PDF
- **✓ proven — print-to-PDF:** a dedicated `@media print` stylesheet turning app state into a
  branded, paginated document (letter/landscape, one section per page) — zero libraries, and the
  browser's print dialog is the "export" button. First choice for proposals/reports.
- Alternatives: Puppeteer/Playwright `page.pdf()` server-side (same HTML→PDF, automated);
  pdf-lib (fill existing PDF forms); avoid heavyweight PDF-builder libraries.

## 13. Spreadsheets & business data
- **✓ proven — CSV export/import** as the interchange with office users.
- Google Sheets: read via export URLs or API; EDITING via browser automation is fragile
  (clipboard/formula gotchas) — prefer the Sheets API or Apps Script for writes.

---

## The meta-rules (apply to every integration)
1. **Secrets server-side only**, in gitignored/`600` files outside the deployed git dir; the proxy
   injects them.
2. **Prefer keyless/free tiers that don't gate the core flow** (Esri tiles, Nominatim, Apps
   Script relay) — but know each one's quota and have a fallback before it's load-bearing.
3. **Every unattended job needs a failure channel** (fallback chain + local artifact). Quota
   exhaustion and expired sessions are WHEN, not IF.
4. **Do the fee math** on percentage-vs-fixed pricing (Stripe's $0.30, per-MB vs bundled data)
   against YOUR average transaction before choosing a provider.
5. **New integration = run `/harden` on the touched surface** before calling it done.
