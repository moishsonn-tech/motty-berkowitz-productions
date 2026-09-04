# Wave C — Documentation accuracy pass (paste this whole thing into a fresh Claude Code session)

You're working in the repo `motty-berkowitz-productions` (a single-author video-production PM
tool for Motty Berkowitz — vanilla-JS/no-build frontend, Supabase backend). Start by reading
`CLAUDE.md` in full for this kit's conventions. Also skim `CODEBASE_REVIEW.md` in the repo root
for full context (a prior codebase-review pass); the items below are IDs 1.5, 2.4, 4.2, 4.6, 4.7,
5.1, 5.2, 5.3, 5.4 from that review. This wave is documentation/comment edits only — no code
logic changes. Verify every claim you write against the actual current code before writing it
(don't just take the review's word for it — re-check).

## Doc fixes

**5.2 — `INTEGRATIONS.md`'s passkey method names are wrong.** It currently describes something
like a `signInWithWebAuthn()`-equivalent and enabling "Web Authn." The real, working
implementation (used in this repo AND in `~/shmuel-app`, the reference project) is:
`createClient(url, key, { auth: { experimental: { passkey: true } } })` at client-construction
time, then `sb.auth.signInWithPasskey()` to sign in and `sb.auth.registerPasskey()` to register a
device. Correct the relevant section(s) of INTEGRATIONS.md to name these exact methods/config so
a future reader can actually find them in the Supabase JS SDK docs. This section is marked
"✓ proven" — make sure the correction reads as confidently proven too, since it now is.

**5.1 — `BACKEND_SETUP.md` contradicts the shipped schema, without saying it's deliberate.**
BACKEND_SETUP.md's own advice says nested arrays "usually become their own table with a foreign
key... once you want to query/sum them server-side." This app DOES sum crew pay and invoice
totals, yet `supabase/schema.sql`'s `projects` table keeps `scenes`, `song_parts`, `crew_pay`,
`invoice`, `location_ids`, and `crew` all as JSONB columns, summed client-side in
`frontend/index.html`. Add a short note (in BACKEND_SETUP.md, near that advice, or as a comment
in schema.sql, your call) explaining this is a deliberate choice appropriate at this app's scale
(a handful of users, no need for server-side aggregation queries) — not an oversight.

**5.3 — `SETUP.md`'s "accounts you need" checklist doesn't branch for the Supabase path.** It
lists a Google account as needed for "Firebase/Firestore... Google sign-in" as if that's the only
option. This project uses Supabase instead (no Google account needed for data/auth at all).
Update the checklist to branch: "Firebase+Google (see INTEGRATIONS.md §5 default) OR Supabase
(see INTEGRATIONS.md §5 step-up / this project's actual choice) — pick one path, you don't need
both."

**5.4 — `.env.example` is missing `GOOGLE_MAPS_KEY`.** `backend/proxy.js`'s own comment (near the
`/api/location-photo` stub route) names `GOOGLE_MAPS_KEY` as the env var to add once that feature
goes live. Add a commented-out `# GOOGLE_MAPS_KEY=` line to `.env.example` so it's discoverable,
noting it's for a not-yet-live feature.

**4.2 — Undocumented inconsistency in `supabase/policies.sql`'s GRANT statements.**
`allowed_emails` grants only to the `authenticated` role, while the 4 data tables (locations,
contacts, projects, extra_events) grant to `anon, authenticated`. Add a one-line SQL comment
explaining why: `allowed_emails` should never be touchable by a fully-anonymous client
(pre-login), whereas the 4 data tables are additionally gated by RLS's `is_allowed_email()` check
regardless of the broader grant — but note this in the comment so a future reader doesn't assume
it's an oversight (a related item, 4.1, about narrowing that `anon` grant, was deliberately NOT
included in this documentation-only wave — leave the actual grant statements untouched here,
comment only).

**4.6 — Two auth boundaries aren't cross-referenced.** This repo has TWO separate, legitimate
auth boundaries: `backend/proxy.js`'s own (currently-stubbed) ID-token gate for its 2
secret-holding routes, and Supabase RLS/`allowed_emails` for all app data. CLAUDE.md's "What
this is" section explains this split once. Add a short cross-reference comment in
`backend/proxy.js` itself (near the top, or near `verifyIdToken`) noting that this file's auth
is unrelated to and separate from the Supabase RLS boundary that protects actual app data — so
someone reading proxy.js in isolation doesn't wonder if this is "the" auth system for the whole
app.

**4.7 — All-or-nothing permission model isn't written down as a deliberate/known limit.** Every
RLS policy in `supabase/policies.sql` grants full read+write to any allowlisted user — there's no
view-only/admin tier. Add a comment in `supabase/policies.sql` (near the `is_allowed_email`
policies) noting this is intentional at the current scale, and that a future view-only tier for
crew would need a real schema change (a role/permission column + differentiated per-operation
policies), not a config toggle.

**2.4 — Undocumented invoice fee formula.** In `frontend/index.html`, `defaultInvoice(p)`
computes the seed invoice fee as `Math.max(budgetNum-crewSum, budgetNum?Math.round(budgetNum*0.3):500)`.
Add a one-line comment explaining: the fee is whatever's left after crew costs, with a floor of
either 30% of the total budget or a flat $500 minimum when there's no budget set yet — so a
future reader (or Claude session) doesn't have to reverse-engineer the business rule from the
math.

**1.5 — Whole-row debounced save has no field isolation, undocumented.** In
`frontend/index.html`, near `scheduleSave()`'s definition, add (if not already fully clear) an
explicit one-line comment: every save is a full-row upsert of the current in-memory object, not
a per-field patch, so two people editing different fields on the same record within the same
~800ms debounce window will last-write-wins clobber each other's unrelated changes. Note this is
an accepted tradeoff at this app's scale (matches the reference implementation's model), not an
oversight — so a future session doesn't "fix" it into something more complicated without reason.

## When you're done
- Read back every doc section you touched once more against the actual current code to make sure
  you didn't introduce a NEW inaccuracy.
- Report exactly which files/sections you changed.
- Ask before committing/pushing, per this repo's normal git workflow.
