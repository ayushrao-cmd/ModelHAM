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

## App structure

| Path | What lives there |
|---|---|
| `src/engine/` | Pure, deterministic TypeScript model: timeline, build-period sources & uses with the interest-during-build (IDC) fixed point, operations, debt, tax, XIRR returns, health checks, bid-price solver, tornado sensitivity |
| `src/fields.ts` | Field registry: label, unit, range, help and section for every input |
| `src/state/` | Zustand store (scenarios, active scenario, persistence) and the memoised `useModel` hook |
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
