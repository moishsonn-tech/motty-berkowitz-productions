# Backend setup structure — graduating a mock/localStorage prototype to a real backend

Every kit-style app starts as a single `frontend/index.html` with a global `S` state object and
`localStorage` standing in for a real database (see CLAUDE.md). This file is the structure for
the day you're ready to make it real. It's sequenced — do it in this order, and the app stays
working (and demoable) at every step instead of a big-bang rewrite.

**Pick the database first.** See `INTEGRATIONS.md` §5 for the Firestore-vs-Supabase decision.
This structure assumes Supabase (Postgres + built-in auth), since that's the pick for apps with
real relational data (multiple linked record types, reporting, cross-record queries) — but the
sequence below is the same shape either way, just swap the specific commands.

## What moves where

The prototype has ONE layer (the browser, talking to nothing). The real app has THREE:

1. **Supabase** — owns the data (tables + RLS policies) and identity (passkey/email/Google
   login). The browser talks to it directly via the Supabase JS client — no proxy in the
   middle for plain reads/writes the logged-in user is allowed to do.
2. **`backend/proxy.js`** — still exists, but its job narrows to ONLY what needs a secret
   third-party key server-side: sending real email, a QuickBooks/Stripe/WhatsApp Business API
   connection, pushing to Google Calendar, generating a PDF server-side. If a capability doesn't
   need a secret, it doesn't need the proxy — let Supabase + RLS handle it directly.
3. **The frontend** — same `S`-object/`render()` shape as always; only the data layer swaps
   from `localStorage.setItem` to Supabase client calls. UI code barely changes.

Don't remove `proxy.js` when Supabase comes in — a common mistake is thinking Supabase replaces
the whole backend. It replaces Firestore + the Google-ID-token auth pattern; it does NOT replace
the proxy's job of holding secrets.

## The sequence

**1. Turn the mock data model into tables.** Your prototype already HAS a schema — it's just
   shaped as JS objects in `S`. List every distinct record type it holds (in a bookings-style
   app: something like artists, events/gigs, charges, projects, activity-log entries) and every
   field each one carries. Each becomes a Postgres table; nested arrays (like a `charges[]` on
   an event) usually become their own table with a foreign key back to the parent, not a JSON
   column, once you want to query/sum them server-side.

**2. Stand up the Supabase project and create the tables** — see the recipe in `INTEGRATIONS.md`
   §5. Do this with RLS ON from the first table, not as a later hardening pass — a table that's
   briefly open "just until I finish the schema" is a table a leaked anon key can read/write
   right now.

**3. Write the RLS policies from your app's EXISTING access rules**, not from scratch — the
   prototype's `isAdminUser()` / per-user-scoping logic already encodes exactly who should see
   what. Translate each check directly into a policy (e.g. "artists only ever see their own
   events" → `using (auth.uid() = artist_id)`; "admin users see everything" → a second policy
   keyed off an `is_admin` claim/table). If the mock app has no code path that lets user A see
   user B's data, the RLS policy shouldn't either.

**4. Wire auth.** Enable the provider(s) you actually want in Supabase Auth (passkey and/or
   Google — see `INTEGRATIONS.md` §4) and replace the mock login/chooser screen with the real
   sign-in flow. Keep the same post-login routing logic (admin → management view, artist → their
   scoped view) — only the "how did we identify this user" step changes.

**5. Swap the data calls one at a time, not all at once.** Pick one read and one write (e.g.
   "load events" and "mark deposit received"), point them at the Supabase client instead of
   `localStorage`, verify that one arc end-to-end for real, then move to the next. This is the
   same "strangler fig, not big-bang" rule as everything else in this kit — the app should be
   deployable and demoable after every single swapped call, never mid-rewrite-broken.

**6. Leave the simulated integrations simulated until each one gets its own real wiring.**
   Fake email sends, fake QuickBooks invoices, fake WhatsApp messages, etc. are independent of
   the database migration — don't block step 5 on also wiring every third-party integration.
   Graduate each one separately, through `proxy.js`, using its own section of `INTEGRATIONS.md`.

## Order of operations, summarized

Tables + RLS → auth → swap reads/writes incrementally → real integrations one at a time via the
proxy. Never: rewrite the whole data layer in one PR, or turn RLS on "later."
