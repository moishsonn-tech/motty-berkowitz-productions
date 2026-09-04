# Codebase Review — motty-berkowitz-productions (2026-09-03)

Full-codebase review, done in 3 passes: (1) 6 parallel agent reviews, one per logical section,
each hunting for Single Source of Truth (SSOT) violations, Separation of Concerns (SoC) issues,
Modularity/extensibility gaps, unclear structure, and documentation gaps; (2) consolidation into
one deduplicated master list (several issues were independently found by 2-3 reviewers — those
are marked as confirmed); (3) one more agent pass scoring every issue on 5 factors. This document
is the record of all three passes plus the final recommendation.

## The 6 sections reviewed
1. Frontend — Data & Sync Layer (`frontend/index.html`: Supabase client, row↔object mapping,
   realtime sync, debounced save, auth wiring)
2. Frontend — Domain Logic / ACTIONS (`frontend/index.html`: business logic, invoice/crew-pay
   math, scene/song-part management)
3. Frontend — Rendering & UI (`frontend/index.html`: CSS, icons, render()/view functions, modals)
4. Backend & Database (`backend/proxy.js`, `supabase/schema.sql`, `supabase/policies.sql`)
5. Documentation (`CLAUDE.md`, `INTEGRATIONS.md`, `SETUP.md`, `BACKEND_SETUP.md`)
6. Repo Structure, Deploy, CI, PWA (folder layout, `deploy/`, `.github/workflows/`, manifest,
   `.claude/skills/`)

**29 unique issues** surfaced (0 rated as an active security exploit; a few are dormant
hardening gaps, most are correctness/consistency bugs or documentation/structure debt).

---

## Full issue list + scoring

Scored 1-5 (low→high) on: short-term reward, long-term reward, risk of NOT fixing, risk of
downstream bugs FROM fixing. Effort is S(<30min)/M(30min-2hr)/L(half-day+)/XL(multi-day or needs
external setup). Calibrated to this being a small single-author-plus-a-few-crew internal tool.

### Section 1 — Frontend: Data & Sync Layer

| ID | Title | Short reward | Long reward | Risk if unfixed | Risk from fix | Effort |
|---|---|---|---|---|---|---|
| 1.1 | Double-subscribe race on sign-in (duplicate realtime channels) | 2 | 2 | 2 | 1 | S |
| 1.2 | Pending saves survive sign-out, fail silently | 3 | 3 | 3 | 2 | S-M |
| 1.3 | `stopSync` hardcodes table list instead of using `TABLE_MAP` | 1 | 3 | 1 | 1 | S |
| 1.4 | Lazy default-data mutation (invoice/crewPay/callsheetDoc) never persisted — **confirmed by 3 reviews** | 4 | 4 | 3 | 2 | S-M |
| 1.5 | Whole-row debounced save has no field isolation (undocumented last-write-wins) — confirmed by 2 reviews | 1 | 2 | 2 | 1 | S |
| 1.6 | Failed saves not retried/queued | 1 | 2 | 2 | 3 | M-L |

*1.1, 1.2, 1.3, 1.4 are real bugs (data consistency / duplicate work / silent failure); 1.5 is an
accepted-tradeoff documentation gap; 1.6 is a reliability gap with no current symptom.*

### Section 2 — Frontend: Domain Logic / ACTIONS

| ID | Title | Short reward | Long reward | Risk if unfixed | Risk from fix | Effort |
|---|---|---|---|---|---|---|
| 2.1 | Invoice-number scheme can collide (`PROJECTS.length`-based) | 3 | 2 | 2 | 1 | S |
| 2.2 | No script-mode invariant guards (addScene/addSongPart assume context) | 1 | 2 | 1 | 2 | M |
| 2.3 | Inconsistent duplicate-guard style (addCrew vs toggleProjectLocation) | 1 | 1 | 1 | 1 | S |
| 2.4 | Undocumented invoice fee formula (30%/$500 floor) | 1 | 2 | 1 | 1 | S |
| 2.5 | `parseMoney` conflates "unset" with "zero" | 1 | 2 | 1 | 2 | M |

### Section 3 — Frontend: Rendering & UI

| ID | Title | Short reward | Long reward | Risk if unfixed | Risk from fix | Effort |
|---|---|---|---|---|---|---|
| 3.1 | Duplicated "flag red when overdue" styling ×3 + 1 dead CSS rule meant to replace them | 1 | 2 | 1 | 1 | S |
| 3.2 | Dead CSS from ≥3 superseded designs; CLAUDE.md still documents one as current | 1 | 2 | 2 | 1 | S-M |
| 3.3 | Three uncoordinated "what views exist" registries, no comment on intent | 1 | 3 | 2 | 2 | M |

### Section 4 — Backend & Database

| ID | Title | Short reward | Long reward | Risk if unfixed | Risk from fix | Effort |
|---|---|---|---|---|---|---|
| 4.1 | `anon` role has full CRUD grant on all 4 tables (RLS blocks it today — dormant) | 1 | 3 | 2 | 1 | S |
| 4.2 | Inconsistent grant scope (allowed_emails vs data tables), undocumented | 1 | 1 | 1 | 1 | S |
| 4.3 | Dead `ADMIN_EMAILS` placeholder implies a nonexistent second admin tier — confirmed by 2 reviews | 1 | 2 | 2 | 1 | S |
| 4.4 | Dead encryption-at-rest scaffolding (`loadST`/`saveST`/`ST`) in proxy.js | 1 | 2 | 1 | 1 | S |
| 4.5 | `verifyIdToken` permanent stub — Generate Script + location-photo features fully dead | 2 | 3 | 2 | 3 | L-XL |
| 4.6 | Two auth boundaries (proxy vs Supabase RLS) not cross-referenced — confirmed by 2 reviews | 1 | 2 | 1 | 1 | S |
| 4.7 | All-or-nothing permission model (no view-only tier) — deliberate current-scale choice | 1 | 2 | 1 | 1 | S |

### Section 5 — Documentation

| ID | Title | Short reward | Long reward | Risk if unfixed | Risk from fix | Effort |
|---|---|---|---|---|---|---|
| 5.1 | BACKEND_SETUP.md contradicts the shipped JSONB schema, no note it's deliberate | 1 | 2 | 1 | 1 | S |
| 5.2 | INTEGRATIONS.md's passkey method names are simply wrong (in a "✓ proven" section) | 2 | 3 | 3 | 1 | S |
| 5.3 | SETUP.md's account checklist doesn't branch for the Supabase path | 1 | 2 | 2 | 1 | S |
| 5.4 | `.env.example` missing `GOOGLE_MAPS_KEY` (minor) | 1 | 1 | 1 | 1 | S |

### Section 6 — Repo Structure, Deploy, CI, PWA

| ID | Title | Short reward | Long reward | Risk if unfixed | Risk from fix | Effort |
|---|---|---|---|---|---|---|
| 6.1 | Two competing frontend deploy mechanisms (GitHub Pages vs SFTP script), no doc says which is live | 3 | 3 | 3 | 2 | M |
| 6.2 | Registered service worker (`sw.js`) doesn't exist — silently broken | 1 | 1 | 1 | 1-2 | S (remove) / M (build real offline support) |
| 6.3 | No `package.json` for deploy scripts' dependencies | 2 | 3 | 2 | 1 | S |
| 6.4 | Inconsistent asset folder structure (cosmetic) | 1 | 1 | 1 | 1 | S |
| 6.5 | No top-level README.md | 1 | 1 | 1 | 1 | S |

---

## Recommendation

Certainty/Timing tiers, highest first:

**Tier 1 — For Sure, Right Now.** Clear positive value, cheap (mostly S effort), no decision
needed from you. Grouped into small, atomically-scoped waves below.

**Tier 2 — For Sure, Soon.** Real value, slightly more effort or better done before something
else grows on top of it.

**Tier 3 — Worth Doing, No Rush.** Real but low-urgency; bundle in opportunistically next time
that code is touched anyway.

**Tier 4 — Optional / Skip For Now.** Low value across the board at this app's current scale.

**Tier 5 — Needs Your Decision First.** Can't act without you choosing a direction.

| Tier | Issues |
|---|---|
| **1 — For Sure, Right Now** | 1.1, 1.2, 1.3, 1.4, 1.5(doc), 2.1, 2.4(doc), 3.1, 3.2, 4.1, 4.2(doc), 4.3, 4.4, 4.6(doc), 4.7(doc), 5.1, 5.2, 5.3, 5.4, 6.2 (remove dead line only), 6.3 |
| **2 — For Sure, Soon** | 3.3 |
| **3 — Worth Doing, No Rush** | 1.6, 2.2 |
| **4 — Optional / Skip For Now** | 2.3, 2.5, 6.4, 6.5 |
| **5 — Needs Your Decision First** | 6.1 (which deploy path is actually live?), 4.5 (do you want Generate Script / location-photos working for real?), 6.2-real-fix (do you want actual offline support, or just remove the broken registration?) |

### Proposed waves (each becomes one ready-to-paste prompt for a fresh session)

- **Wave A — Sync/save correctness fixes** (1.1, 1.2, 1.3, 1.4, 2.1): all in the same area of
  `frontend/index.html`, all real bugs, natural to fix and test together.
- **Wave B — Dead code removal** (4.3, 4.4, 3.2, 6.2-removal): pure deletions, near-zero risk.
- **Wave C — Documentation accuracy pass** (1.5-doc, 2.4-doc, 4.2-doc, 4.6-doc, 4.7-doc, 5.1,
  5.2, 5.3, 5.4): doc-only edits, no code risk at all.
- **Wave D — Supabase access hardening** (4.1): one small SQL migration you'll need to run.
- **Wave E — Deploy reproducibility** (6.3): add a `package.json` for the deploy scripts.
- **Wave F — View-registry & styling DRY** (3.1, 3.3): small rendering-layer refactor.

Waves A-C-E-F have no ordering dependency on each other and could each be handed to a separate
fresh session in parallel if you want to move fast; D should follow C (so the doc explaining the
grant split is already in place) but doesn't strictly block anything.

Tier 5 items are decisions, not waves — see the questions below.
