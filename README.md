# Milestone: HAM bid modeller (demo)

An interactive re-imagining of an Indian highway **Hybrid Annuity Model (HAM)** bid spreadsheet: edit any
assumption and every KPI, chart and health check updates instantly.

> **Demo with sample data.** The figures are illustrative, built around a generic "Sample Greenfield
> Corridor – Pkg 2". They are not a real bid and must not be presented as one. The engine is
> directionally right and internally consistent, not a to-the-rupee replica of the source workbook.

![Overview](docs/screenshots/overview-1440-light.png)

## Run, test, build

Requires Node 20 or later.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: engine, formatting, store, components
npm run typecheck
npm run lint
npm run build      # static site in dist/, deploy anywhere
```

## Projects: sample and blank

Each **project** is one bid with its own scenarios (base, compare, active). The project menu in the top bar
switches, creates, duplicates, renames and deletes projects (never the last one).

- **Sample project**: the demo data above, tagged "Demo data" in the top bar.
- **Blank project**: your own bid. It never shows a demo number. Every input is in one of three classes
  (`FieldDef.prefill` in `src/fields.ts`):
  - **Project data, starts empty**: bid price, estimate, length, dates, build days, EPC and lump-sum soft costs,
    milestones, funding split, loan rates, repayment schedule, reference lending rates, operating costs,
    maintenance, resurfacing years, insurance, inflation, WPI/CPI, project and authority name.
  - **HAM concession standard, pre-filled, tagged "MCA standard"**: Operate Years (15, fixed), Construction
    Support and its tranches, Completion Payments and the 30-installment schedule, first-payment lag, annuity
    spread, O&M payment rates, WPI weight, Performance Security and its commission.
  - **Statutory / policy, pre-filled, tagged "Standard"**: GST, tax rate, surcharge and cess, leverage and DSCR
    warning levels, max rate-quote age, equity IRR hurdle, and the percentage-based soft costs (pre-bid
    allowance, SPV formation, admin, IE fee, fund-raising fee).
  - Selects (pavement type, EPC phasing) keep a default choice.

  Empty inputs show "Required". The engine does not run until every value is filled: results, charts and KPIs
  are replaced by a card listing the missing fields (as links) with progress, and Health shows only the
  "Required" checks. Scenario JSON export carries the empty list; import goes into the active project.

## Saved data

Projects, their scenarios and the theme choice are saved in browser cookies (`milestone.scenarios.v1.*`,
`milestone.theme.*`), so they survive refreshes and restarts until you clear cookies for the site. Each scenario
stores only the fields that differ from its project's template (demo defaults or the blank template) plus its
empty fields, split across ~4 KB cookies. Saves from before projects existed load as one sample project. Browsers cap cookie lifetime (Chrome: 400 days, renewed on every
save; Safari: 7 days for script-set cookies). Use Export → scenario JSON for a permanent copy.

## App structure

| Path | What lives there |
|---|---|
| `src/engine/` | Pure, deterministic TypeScript model: timeline, build-period sources & uses with the interest-during-build (IDC) fixed point, operations, debt, tax, XIRR returns, health checks, bid-price solver, tornado sensitivity |
| `src/fields.ts` | Field registry: label, unit, range, help and section for every input |
| `src/state/` | Zustand store (projects, scenarios) persisted to browser cookies; blank template and empty-field helpers (`projects.ts`); the memoised `useModel` hook (null results while a scenario is incomplete) |
| `src/app/` | Shell: hash router (`#/overview`, `#/deal`, …), sidebar, top bar, ⌘K command palette, theme |
| `src/sections/` | One screen per section: Overview, Deal & Timeline, Build, Capital, Income, Operations, Returns, Health, Scenarios |
| `src/components/` | Typed input fields, KPI tiles, data tables, solve card, shadcn/ui primitives |
| `src/charts/` | Recharts charts and the pure data mappers they render |
| `src/lib/` | Formatting (`en-IN`, ₹ crore), JSON/CSV export, path helpers |
| `docs/` | Design spec, implementation plan, screenshots |

The workbook's tabs are replaced by a story-ordered flow (deal → build → fund → earn → operate →
return → health). The full design is in [`docs/2026-11-25-milestone-design.md`](docs/2026-11-25-milestone-design.md).

## What's simplified vs the workbook

Out of scope for this demo: IGAAP and IndAS statutory statements, balance sheet, termination payments,
CSR, mobilisation advance / short-term loan (a net-neutral pass-through to the EPC contractor in the
workbook), early-completion bonus, Excel export, auth, backend, multi-user.

Fixed by design: **Operate Years is 15** (the concession agreement period), shown read-only. The
Completion Payment schedule (30 half-yearly installments), the repayment schedule (25 half-yearly
repayments) and the O&M schedule are sized for it.

**Construction Support (% of Bid)** sets the total support (% × Bid Price); the Support Tranches split
it in proportion to their weights, landing each tranche in the first build month that reaches its
physical progress. Weights need not sum to anything.

## Audit findings and their resolution

| Audit finding | Resolution in app |
|---|---|
| MCLR check uses TODAY() | Rate-quote date must be ≤ 3 months before **bid date** |
| Two MCLR tables (9.84% shown vs 9.82% used) | One input table, one derived rate |
| IO equity-for-STL 25% vs DB 10% | STL removed (non-goal); no duplicate inputs anywhere |
| Milestone days duplicated (IO vs CA Set) | Single Build Milestones input |
| MCLR validity linked to wrong check | Each check is a typed object; status shown = status computed |
| Master check omits loan-repayment check | Health score aggregates every check automatically |
| Asset-allocation check disabled (`*0`) | Sources = Uses check, always live |
| Sch-G ranges drift; MIN masks excess grant | Milestone check compares funding vs cost both ways |
| COD balance sheet refs drift / `#REF` GST | Balance sheet out of scope; typed engine has no cell refs |
| APSBG denominator hardcoded | Additional Performance Security derived from Authority Estimate input |
| Mid-row hardcodes (phasing 0.0274, electricity 3%) | Rows generated from inputs; no per-period overrides |
| Repayment last-installment plug | Schedule must sum to 100%, else Health error |
| Annual IRR vs XIRR mixed | XIRR everywhere |
| O&M runs at a loss | Health warning "O&M margin negative" with amount |
| Two authority costs (2,500 vs 2,183.15) | Only Authority Estimate (2,183.15); bid-vs-estimate % shown once |
| Insurance "−115% discount" | Shown as "loading ×2.15" |
| Pre-bid misc 100% | Kept as an explicit, labelled multiplier input |
| Stale labels (MM @7/14, "ignore if <1") | Labels generated from inputs |
| Hardcodes (60/45/150 d, 0.25% spread, 25/30 counts, 30/70 weights, IMV formula) | All labelled inputs with units and tooltips |
| Prior-version snapshot row | Replaced by real scenario compare |
| Hidden sheets, 1,046 broken names, junk names, OFFSET, iterative calc | Not carried over; circularity solved in code |

**Dead ends dropped:** IO MCLR display table, IO milestone days, IO equity-for-STL, DB unused OP-period
reserve inputs, DB sensitivity row (replaced by the tornado), all hidden sheets, IGAAP/IndAS duplication,
termination module, CSR, mobilisation advance/STL.

## Accessibility

WCAG 2.2 AA in light and dark themes (axe-core and AccessLint scans clean on every section), visible
focus rings, keyboard operable (⌘K / Ctrl K palette, skip link), reflows without horizontal scroll down to
320px, and charts and number tweening respect `prefers-reduced-motion`.
