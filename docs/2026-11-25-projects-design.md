# Milestone — Multiple projects & blank projects · Design

Date: 2026-11-25 · Builds on `2026-11-25-milestone-design.md` (still binding for everything not changed here).

## 1. Intent

Users want to model **their own bids**, several of them, not just the demo. So:
- **Projects**: each project is one bid with its own scenarios (base, compare, active). Switch, create, duplicate,
  rename, delete.
- **Blank new projects**: a new project starts empty and the user enters their own data. No demo number may ever
  appear inside a user's project — not in a KPI, chart, table, check or toast.
- Everything persists in cookies as today, until cleared.

User decisions: new project starts **Blank** (asked); "data should be enterable" = **enter my own project** (asked).

## 2. Brainstorm — what "blank" should mean (decided)

Three options were weighed:
1. *Literally every number empty* — the user would have to type the MCA's 30-value Completion Payment schedule,
   O&M rates, GST 18%, 22% tax etc. by hand: identical for every NHAI HAM bid, error-prone, and a terrible first run.
2. *Blank project data, keep concession standards & statutory values pre-filled (editable, tagged)* — **picked**.
3. *Copy the demo and let users overwrite* — leaks demo numbers into a user's bid; rejected (anti-goal).

So each field gets a class (new `FieldDef.prefill?: 'standard' | 'policy'`):
- **Project data — starts empty**: bid price, authority estimate, length, bid & rate-quote dates, timeline days,
  build days, EPC & every soft cost, phasing milestones (days & %), equity/upfront/share-capital %, loan rates,
  repayment schedule, bank reference rates, all operating costs, major maintenance, resurfacing years, insurance
  rates, inflation & WPI/CPI rates, project name, authority name.
- **HAM concession standard — pre-filled, tagged "MCA standard"**: Operate Years 15 (locked), Construction Support
  40%, support tranches (progress points & weights), Completion Payments 60%, the 30-installment schedule,
  first-payment lag 180 days, annuity spread 1.25%, O&M payment rates, WPI weight 70%, performance security 5% and
  its commission.
- **Statutory / policy — pre-filled, tagged "Standard"**: GST rates, tax base/surcharge/cess, max leverage 3.0×,
  DSCR warning 1.10×, max rate-quote age 3 months, equity IRR hurdle 15%, pre-bid misc allowance, SPV formation %,
  admin %, IE fee %, fund-raising %.
- Selects (pavement, phasing) keep a default choice.
The builder may move an individual field between classes if the above is plainly wrong for it; record why.

## 3. Data model

```ts
type Template = 'sample' | 'blank'
interface Scenario { id; name; inputs: Inputs; updatedAt; empty: string[] } // empty = leaf paths with no value yet
interface Project { id; template: Template; scenarios: Scenario[]; activeId; baseId; compareId; createdAt }
```
- Store keeps `projects: Project[]` and `projectId`. **The active project's `scenarios/activeId/baseId/compareId`
  stay as top-level store fields** (so every existing selector keeps working); `projects` holds the others and is
  synced on switch/persist.
- Leaf paths use the existing dotted path syntax incl. list cells (`capital.repayment.3`, `milestones.0.day`,
  `operations.resurfacingYears.1`). `blankProject()` builds inputs from a **blank template** (empty leaves set to a
  neutral internal value — 0 / '' — that is never displayed or computed) and lists every empty path.
- Project label = base scenario's `deal.projectName` (fallback "Untitled project"); renaming a project sets
  `deal.projectName` in all its scenarios.

Store actions (add, tested): `createProject(kind: 'blank' | 'sample' | 'duplicate'): string` (switches to it),
`setProject(id)`, `renameProject(id, name)`, `deleteProject(id)` (never the last). Existing scenario actions act on
the active project. `setInput(path, v)` also removes `path` and any `path.*` from the active scenario's `empty`.
`createScenario` copies `empty`. `referenceInputs`/`resetField`/`resetActive`: for the **base scenario of a blank
project** the reference is *blank* — reset marks the field empty again; no "changed" dots there (no demo leak).

## 4. Gating results (no demo leak, enforced by the type system)

- `useModel()` → `{ active: ModelResult | null; base: ModelResult | null; checks; score; missing: Missing }` where
  `Missing = { paths: string[]; byField: { fieldId, label, section, count, total }[]; filled: number; total: number }`.
  **The engine never runs on an incomplete scenario** (`active === null`). Making it nullable lets `tsc` find every
  consumer.
- New `<ResultsGate>`: when `missing.paths.length`, renders a calm card: "Fill in N more fields to see results",
  a progress bar (`filled / total`), and the missing fields grouped by section as jump links (existing `go()`);
  otherwise renders children. New `useResult(): ModelResult` throws if null — only used under a gate.
- Gate: every section's results column (SectionLayout), Overview below its header (KPIs, Solve, charts, top
  issues → replaced by the gate), Returns results (the Targets inputs stay usable), Scenarios compare KPIs (show
  "incomplete" for an incomplete side). KPI deltas only when both active and base are complete.
- Checks while incomplete: **only** "required" checks — one per FieldDef with ≥1 empty leaf, id `field:<fieldId>`,
  severity error, message `Required` (scalar) or `N of M values missing` (lists). Field inline errors, sidebar dots,
  Health page, ⌘K and the top-bar badge then work unchanged. Check-flip toasts are suppressed while the scenario is
  incomplete and on the transition to complete show one toast "All fields filled — results are live".

## 5. UI

- **Project switcher** in the top bar before the scenario switcher (dropdown): project list (name, "Sample" or
  "n% filled" badge, current ticked); actions: *New blank project*, *New sample project*, *Duplicate project*,
  *Rename…* (small dialog), *Delete…* (confirm dialog naming the project). Truncate long names; works at 390px.
- **Empty fields**: inputs render empty with placeholder "Required" (lists: empty cells), plus the existing inline
  error. Pre-filled standard fields show a small "MCA standard" / "Standard" tag next to the label.
- **Progress**: Health page header and the gate show "23 of 141 fields filled".
- "Demo data" badge only on sample projects.
- Export/import: scenario JSON carries `empty`; import goes into the active project.

## 6. Persistence & migration

- Persist `{ projects (active one upserted), projectId }`, `version: 2`. Each scenario stores `inputs` as a diff
  against **its project's template** (demo defaults or blank template) plus `empty`. Rehydrate merges onto the
  template, validates, then re-applies `empty` (empty paths are exempt from date/select validation so nothing falls
  back to demo values). Unknown/invalid `empty` paths dropped.
- v1 data (`{scenarios, activeId, baseId, compareId}`) migrates into one `sample` project. Cookies unchanged.

## 7. Non-goals
Server sync, sharing projects between people, per-project export bundles, undo history.

## 8. Tests that must exist
blank project has no demo values in any leaf that's empty; engine not run & checks = required only while empty;
filling the last field makes results appear; reset on blank base re-empties; project create/switch/rename/delete;
persistence round-trip of 2 projects incl. a partially filled blank one; v1 → v2 migration; ResultsGate renders
missing list and jump links; no "Demo data" badge on blank projects.
