# Wave A — Sync/save correctness fixes (paste this whole thing into a fresh Claude Code session)

You're working in the repo `motty-berkowitz-productions` (a single-author video-production PM
tool for Motty Berkowitz — vanilla-JS/no-build frontend, Supabase backend). Start by reading
`CLAUDE.md` in full — it's the engineering-priorities/conventions file for this kit, read it
before planning anything. Also skim `CODEBASE_REVIEW.md` in the repo root for the full context
behind this specific work (it's a prior codebase-review pass); the issues below are IDs 1.1, 1.2,
1.3, 1.4, and 2.1 from that review, all confirmed real bugs, all in `frontend/index.html`'s
Supabase data/sync layer and the adjacent invoice logic.

Fix these 5 bugs. Treat this as one arc — implement, review your own diff, then verify each fix
actually works against the real running app (start a local static server for `frontend/`, use
the browser) before calling it done, per this repo's PR Process in CLAUDE.md.

## 1. Double-subscribe race on sign-in (`startSync()`)
`startSync()`'s only re-entry guard is `if(syncChannels.length) return`, checked at the top of
the function, but the function is `async` and does `await Promise.all(...)` before it ever
pushes anything into `syncChannels`. Both `sb.auth.onAuthStateChange`'s `INITIAL_SESSION` event
and the separate `sb.auth.getSession().then(...)` call `startSync()` on load — if both fire
before either call has reached the point of populating `syncChannels`, the guard does nothing
and you get two realtime channels per table (double network calls, duplicate re-renders).
Fix: set a synchronous re-entry guard at the very top of `startSync()` (e.g. a module-level
`let syncing = false;` flag set to `true` before the first `await` and checked/set atomically),
not one that depends on state that's only populated after an await.

## 2. Pending debounced saves survive sign-out and fail silently
`stopSync()` clears the four data arrays but never touches `_saveTimers` (the debounce-timer map
`scheduleSave()` uses). A save scheduled just before sign-out still fires ~800ms later against a
session that's gone. Worse: the resulting error calls `showToast(...)`, but `render()` already
shows the sign-in screen at that point and short-circuits before the toast markup would ever be
included in the DOM — so the failure is completely invisible, not just late.
Fix: in `stopSync()`, clear every pending timer in `_saveTimers` (clearTimeout each, then empty
the object) so no save fires after sign-out. Decide and implement one of: (a) just drop the
pending change (simplest, acceptable given it's a local edit within the last ~800ms of a session
ending), or (b) flush it immediately (fire the pending save synchronously before clearing state)
if you judge that's safer for not losing a just-typed edit. Pick (a) unless you have a strong
reason to prefer (b) — document whichever you pick with a one-line comment explaining why.

## 3. `stopSync` hardcodes the table list instead of using `TABLE_MAP`
`stopSync()` does `LOCATIONS=[]; CONTACTS=[]; PROJECTS=[]; EXTRA_EVENTS=[];` by name. `TABLE_MAP`
already exists specifically so table wiring lives in one place — use
`Object.values(TABLE_MAP).forEach(t=>t.set([]))` instead so a future 5th table doesn't need this
touched too.

## 4. Lazy default-data mutation is never persisted (the important one — confirmed independently
by 3 separate review passes)
`getInvoice(p)` and `crewPayFor(p,cid)` both lazily create a default value and assign it onto `p`
as a side effect of what reads like a pure accessor/getter — with no `scheduleSave('projects',p)`
call. Same issue in `tabCallsheet()`'s `callsheetDoc` seeding (`defaultCallsheetHTML`). The
freshly-created default sits in local memory only until some UNRELATED write on that project
happens to fire later and carries it along. Concretely: open a brand-new project's Financials
tab (or Call Sheet tab) for the first time, do NOT touch anything else, and the computed default
invoice/call-sheet-doc will not appear in the Supabase `projects` table until you make some other
edit to that project.
Fix: after each of these lazy-create sites materializes a default value onto `p`, call
`scheduleSave('projects', p)` right there so the newly-created default actually persists.
Verify by: creating a new project, opening its Call Sheet tab (don't edit anything), waiting
~1s, and checking the Supabase table editor (or a second browser tab/session) shows the
`callsheet_doc` column populated without you having made any other edit. Do the same check for
opening Financials (verify `invoice` column populates).

## 5. Invoice-number scheme can produce duplicates
`defaultInvoice(p)` computes `'INV-'+(1044+PROJECTS.length)`. It's called both at project
creation (before the new project is pushed into `PROJECTS`) and lazily by `getInvoice()` for any
already-loaded project whose `invoice` is null. In the lazy path, two DIFFERENT projects that
each lazily get an invoice while `PROJECTS.length` hasn't changed between the two calls will get
the IDENTICAL invoice number.
Fix: make the invoice number actually unique — the simplest correct approach is to base it on
something that can't collide, e.g. a short slice of the project's own `id` (a UUID, since
projects are now Supabase rows with `gen_random_uuid()` ids) or a monotonic counter stored
somewhere real, not `PROJECTS.length`. Keep the same `'INV-XXXX'`-style display format Motty is
used to seeing if you can, but prioritize correctness over preserving the exact old numbering
scheme.

## When you're done
- Re-read your diff against CLAUDE.md's Engineering Priorities (elegance, blast radius, SSOT).
- Test all 5 fixes against the real running app, not just "it compiles."
- Report what you verified and how, honestly — if something couldn't be tested live (e.g. no
  Supabase project reachable), say so explicitly rather than claiming it's confirmed working.
- Ask before committing/pushing, per this repo's normal git workflow.
