# Milestone — HAM Bid Modeller (demo) · Design

Date: 2026-11-25 · Source workbook: `20260707_V16_HAM Bid FM_Flexible and Rigid pavement_1095 Days (6)_1129.xlsx`

## 1. Intent

Turn the V16 Hybrid Annuity Model (HAM) bid workbook into a **Node/web demo app** that shows what a
modern, interactive version of the model feels like. Audience: people being shown the product
(showcase), not lenders. So the look, interactions and live checks matter most; the engine must be
**directionally right and internally consistent**, not a to-the-rupee replica.

User asks (verbatim intent): Stripe/Ramp-grade UI; interactive UX with many kinds of UI checks;
a structure different from the sheet; lightly renamed fields (same meaning); charts; remove every
problem found in the audit; drop dead ends (inputs/sheets nothing uses).

## 2. Goals / non-goals / anti-goals

**Goals**
- Edit any assumption → every KPI, chart and check updates instantly.
- A "Health" system that validates inputs and results, explains each failure, and jumps to the field.
- Scenarios: save, duplicate, compare two side by side with deltas.
- Charts for funding, construction drawdown, milestone compliance, income, coverage, sensitivity.
- Every audit finding is either fixed by design or removed (see §8).

**Non-goals (demo)**
- IGAAP + IndAS statutory statements, balance sheet, termination payments, CSR, mobilisation
  advance / short-term loan (net-neutral pass-through to the EPC contractor in the workbook),
  early-completion bonus, Excel export, auth, backend, multi-user.

**Anti-goals** (failure even if it "works")
- Looks like a spreadsheet re-skin (tabs mirroring sheets, cell grids as the main UI).
- A check that can't fail, a dashboard value that isn't the value the engine uses, or a hidden plug.
- Shipping the client name or presenting demo numbers as a real bid.

## 3. Constraints

- Node ≥ 20, runs locally with `npm i && npm run dev`; static build deployable anywhere (Vercel).
- All calculation client-side, pure TypeScript, deterministic, unit-tested.
- Sample data: workbook figures, but generic project name ("Sample Greenfield Corridor – Pkg 2"),
  no contractor name. A visible "Demo data" badge. *(my call)*
- Money in ₹ crore, Indian grouping (`en-IN`), 2 dp; percentages 1–2 dp; dates `dd MMM yyyy`.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | **Vite + React + TypeScript SPA**, engine as a pure TS module, Tailwind + shadcn/ui (Radix), Recharts, Zustand | Simplest thing that delivers live interactivity; no server needed for a demo; fast dev loop. |
| B | Next.js app (server components, API route for engine) | SSR/routing power unused by a single-user demo; more moving parts. |
| C | Express + server-rendered pages + htmx | Weakest interactivity — every slider move round-trips; fights the Stripe/Ramp feel. |

User delegated the choice ("you pick the best"); A chosen.

## 5. Information architecture (new structure, not the sheet's)

Workbook tabs (IO, DB, Fin Set, CA Set, COP-MOF, EPC Phasing, Revenue, O&M Cost, Debt, Inflation,
Fin-IGAAP/INDAS, Checks…) are replaced by a **story-ordered** flow — *deal → build → fund → earn →
operate → return → health*:

| App section | Replaces (workbook) | Content |
|---|---|---|
| **Overview** | IO dashboard, DB | KPI tiles (Equity IRR, Project IRR pre/post tax, Min/Avg DSCR, Total project cost, Health score), "Solve Bid Price for target equity IRR", mini charts, top issues |
| **Deal & Timeline** | IO inputs, DB dates | Bid price, authority estimate, length, dates (bid → award → agreement → appointed date → COD → first annuity → end), visual timeline |
| **Build** | DB cost table, COP-MOF uses, EPC Phasing, CA Set Sch-G | Construction budget (hard + soft costs, GST), phasing curve, milestone compliance |
| **Capital** | COP-MOF sources, DB capital structure, Debt | Funding stack (support / equity / senior debt), drawdown, IDC, reserves, repayment profile |
| **Income** | Revenue | Completion-cost installments, interest on balance, O&M payments, indexation |
| **Operations** | O&M Cost, Inflation | Routine & major maintenance, SPV costs, insurance, inflation rates |
| **Returns** | Fin-IGAAP IRR/DSCR block | IRRs (all XIRR), DSCR series, cash waterfall, sensitivity tornado |
| **Health** | Checks, Sch-G Compliance, scattered checks | Every check with status, explanation, jump-to-field |
| **Scenarios** | (none) | Saved scenarios, compare view |

App shell: left sidebar (sections + health dot per section), top bar (scenario switcher, ⌘K command
palette to jump to any field/section/check, health badge, Demo badge, theme toggle, export menu).
Each section = inputs panel (grouped cards) on the left/top + results & charts on the right/below.

## 6. Renamed fields (same meaning)

| Workbook | App |
|---|---|
| Bid Project Cost (BPC) | Bid Price |
| Authority Cost / Estimated Project Cost | Authority Estimate |
| COP-MOF / Cost of Project – Means of Finance | Sources & Uses |
| Grant / Authority Grant (40%) | Construction Support |
| 60% Completion Cost installments | Completion Payments |
| Annuity interest | Interest on Outstanding Balance |
| Price Index Multiple (PIM) | Indexation Factor |
| MCLR / Average MCLR + spread | Reference Lending Rate / Annuity Rate |
| RTL ROI – CP / OP | Loan Rate – Build / Operate |
| DSR / DSRA | Debt Service Reserve |
| MM / RM | Major Maintenance / Routine Maintenance |
| Layering year | Resurfacing year |
| Appointed Date / COD | Start Date / Completion Date (COD shown as tooltip) |
| IDC | Interest During Build |
| PSBG / APSBG | Performance Security / Additional Performance Security |
| IE Fee | Independent Engineer Fee |
| Schedule-G milestones | Build Milestones |
| MCA Clause 22.1 | Financing Tie-up Test |
| Checks | Health |

## 7. Engine (simplified, demo-grade)

Pure function `runModel(inputs): Results`. Monthly grid in the build period, half-yearly grid in
operations (aligned to payment dates). All defaults come from the workbook (seed file
`src/engine/defaults.ts`, values listed below).

**Headline defaults (from workbook).** Bid Price 2,250; Authority Estimate 2,183.15; length 32.955 km;
bid date 08 Jul 2026; rate-quote date 01 Jul 2026; build loan rate 9.75%; operate loan rate 9.50%;
equity 25% of funding need (of which share capital 25%, promoter sub-debt 75% — display split only);
performance security 5% of bid. Build Milestones (day from start / required physical % / required
financial %): 274 / 20 / 20 · 548 / 35 / 35 · 821 / 75 / 75 · 1095 / 100 / 100.
Additional Performance Security (d = discount of bid below Authority Estimate): 0 if d ≤ 10%;
0.1% × (d − 10 pts) of bid if 10% < d ≤ 20%; 1% + 0.2% × (d − 20 pts) of bid above 20% (points
rounded) — workbook rule; verify against the RFP before real use.

**Timeline.** Award = bid + 60 d; agreement = award + 45 d; start (appointed) = agreement + 150 d
(all three are labelled inputs, not hardcodes); completion = start + build days (1095) − 1;
first payment = completion + 180 d, then every 6 months, 30 payments; end = completion + 15 y.

**Indexation.** Factor(t) = (1+i)^(years from bid date), i = 0.7·WPI + 0.3·CPI (both 4%), weights
are inputs.

**Uses (build cost).** EPC fixed 1,750 + 18% GST; EPC variable = indexation uplift on Construction
Support (passed through to contractor); IE fee 0.4% of bid; SPV admin 2.5% of EPC; fund-raising 1% of
debt; finance & legal lump sum 4.21; contingency 5; pre-bid 0.58; SPV formation 0.25% of share
capital; patrol vehicles capital 1.03 + rental 0.846; performance-security commission 1.5% p.a. on
5% of bid over the build period; GST at the per-line rates (inputs). Interest During Build at the
build loan rate on drawn debt (monthly). Debt Service Reserve at completion = next half-year's debt
service; bridge to first payment = first half-year's opex.
EPC phasing: equated monthly (S-curve option), with the user choosing phasing mode; physical progress
derived from cumulative EPC.

**Sources.** Construction Support = 40% of bid × indexation at each tranche, paid in 10 tranches
(4% each) at physical progress 5,10,20,…,90% (inputs), + GST. Remaining need split equity 25% /
debt 75%; 50% of equity upfront, rest pro-rata with debt. **Circularity (IDC ↔ debt size ↔
fund-raising fee)** solved by fixed-point iteration in code (≤ 50 iterations, tolerance ₹1 lakh),
reported in Health if not converged. No iterative-calc setting, no plugs.

**Income (operations).** Completion Payments base = 60% of bid × indexation at completion; 30
half-yearly installments using the workbook schedule
`[2.10,2.17,2.24,2.31,2.38,2.45,2.52,2.60,2.68,2.76,2.84,2.93,3.02,3.11,3.20,3.30,3.40,3.50,3.61,3.72,3.83,3.94,4.06,4.18,4.25,4.25,4.44,4.71,4.75,4.75]%`.
Interest on Outstanding Balance = opening balance × annuity rate / 2, annuity rate = average of 5
bank reference rates (8.70, 8.35, 8.35, 8.70, 8.75 → 8.57%) + 1.25% = **9.82%** (single source).
O&M payments = % of bid per operating year × indexation, paid half each half-year. The schedule is
**derived from the resurfacing years** (as the workbook does): year 1 = 0%; resurfacing year = 2.4%;
year before resurfacing = pre-resurfacing rate; all other years = 0.4%. Pavement type sets the
pre-resurfacing rate: *Flexible* 0.8%, *Flexible perpetual* 0.6% (default — matches the workbook's
₹225 Cr uninflated total). Defaults (resurfacing 6 & 12) give
`[0,0.4,0.4,0.4,0.6,2.4,0.4,0.4,0.4,0.4,0.6,2.4,0.4,0.4,0.4]%`. Moving resurfacing moves both the
major-maintenance cost and the 2.4% payment.

**Operations cost** (₹ Cr/yr at bid-date prices, excl. GST): routine maintenance 2.31, electricity
1.87, finance & legal 1.42, SPV staff 1.00, patrol vehicle running 0.22, IE fee 1.50, insurance
= base rate 0.14% × loading 2.15 × EPC (≈ 5.48 — the workbook's "−115% discount" shown honestly as a
2.15× loading), major maintenance 27.83 in each resurfacing year. Inflation: maintenance 4.5%,
staff 7%, electricity 3%, insurance 0%.

**Senior debt (operations).** Operate loan rate 9.50% (input, not "build rate − 0.25%"), half-yearly
interest on opening balance, repayment over 25 installments from the first payment date using
`[1.5,1.5,2,2,3,3,4,4,4.5×6,4.4×6,5,5,5.5,5.5,4.6]%` — must sum to exactly 100% (validated, no plug).
Reserve held at next period's debt service, released at maturity.

**Tax.** 25.168% shown as 22% × 1.10 surcharge × 1.04 cess (components editable). Taxable income =
(Completion Payments + interest income + O&M payments) − opex − interest expense − straight-line
amortisation over the operating period of build cost **net of Construction Support** (excl. GST);
losses carried forward. *(my call: consistent with treating support as a reduction of asset cost)*

**Returns.** All IRRs via **XIRR on dated cash flows** (one method everywhere). Project flows =
−(debt + equity draws) in build, + (income − opex − tax[post-tax]) in operations. Equity flows =
−equity draws, + cash after debt service and reserve movements − tax. DSCR per half-year = CFADS /
(principal + interest); min & average.

**GST** *(my call)*. Authority pays GST on top of Construction Support, Completion Payments and O&M
payments (pass-through, shown as memo lines). Input GST on build costs less output GST received on
Construction Support = net GST credit at completion (workbook ≈ ₹157.7 Cr), funded in the build cost and
recovered as a cash inflow by offsetting output GST on Completion Payments until exhausted.

**Calibration target (soft, informational test)** *(my call)*. Workbook figures (Equity 15.1%,
Project pre-tax 11.8%, post-tax 10.4%; DSCR min 1.20, avg 1.47) were computed with annual IRR, annual
DSCR, the repayment plug and pre-fix inputs. The test asserts results within **±1.5 pp / ±0.15** and
prints a reconciliation table (each fix toggled one at a time) so differences are explainable. It is a
sanity band, not a hard gate; internal-consistency tests (sources = uses, balances roll forward, debt
repaid to zero) are the hard gates.

**Solve Bid Price** *(my call — core HAM use, strong demo moment)*. Overview has a "Solve for target
equity IRR" control: bisection on Bid Price over runModel (≤ 40 runs, target < 300 ms; move engine to a
Web Worker only if slower).

**Sensitivity.** Tornado re-runs the engine at ±10% on bid price, EPC cost, annuity rate, loan rate,
inflation, operations cost.

## 8. Audit findings → resolution

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
reserve inputs, DB sensitivity row (replaced by tornado), all hidden sheets, IGAAP/IndAS duplication,
termination module, CSR, mobilisation advance/STL.

## 9. Health system ("UI checks")

Each check: `id, section, field?, severity (error|warning|info), status, message, value, threshold`.
Health score = passed / total, with error count. Clicking a check navigates to and focuses the field.

1. Input validation per field (ranges, required, integer, sums-to-100% lists, resurfacing years:
   second > first + 5 and < operation years, dates in order).
2. Financing tie-up: debt + equity ≥ min(90% × (Authority Estimate − 40% × Bid), 60% × Bid).
3. Build milestones: projected physical & financial progress ≥ required at each milestone; and
   cumulative funding (support + equity + debt) ≤ cumulative cost at each milestone — any excess is
   reported with its amount instead of being clipped (the workbook's MIN hid ₹8.17 Cr).
4. Coverage: DSCR ≥ 1.00 every period (error); < 1.10 (warning; threshold editable).
5. Debt fully repaid by final payment; repayment & completion schedules each sum to 100%.
6. Rate quote freshness vs bid date.
7. Additional Performance Security triggered if bid is > 10% below Authority Estimate (info + amount).
8. Leverage ≤ 3.0× debt:equity.
9. Sources = Uses; build-period cash never negative.
10. O&M margin (payments − costs) negative → warning.
11. Solver converged (IDC iteration).
12. Equity IRR vs hurdle (input, default 15%) → info.

Field-level UX: inline message under the input, red/amber ring, section dot in sidebar, top-bar
badge count, toast when a change flips a check.

## 10. UI / visual system

- Stripe/Ramp-inspired (not imitating either brand): light neutral canvas, white cards, 1px hairline
  borders, 10–12px radius, soft shadows; Inter with tabular numerals; one accent (indigo) + semantic
  green/amber/red; generous whitespace; dark mode.
- Inputs: numeric fields with unit adornments, sliders for key levers, segmented controls for modes,
  "changed vs base" dot + per-field reset, keyboard-first (⌘K, tab order), debounced live recompute.
- KPI tiles with delta vs base scenario and sparkline.
- Charts (Recharts): Sources & Uses stacked bar; monthly drawdown stacked area with milestone
  markers; milestone progress vs requirement step chart; half-yearly income stack
  (principal/interest/O&M); DSCR line with threshold bands; debt balance area; equity cash waterfall;
  sensitivity tornado. Tooltips, legends, accessible colours in both themes.
- Motion: subtle number tweening and chart transitions; respects reduced-motion.
- Accessibility: WCAG AA contrast, focus rings, labels, keyboard operable.
- Export: scenario JSON (import too) and schedules CSV.

## 11. Decided vs left to builder

**Decided:** stack (A), sections & renames (§5–6), engine scope & defaults (§7), fixes (§8), checks
(§9), visual direction (§10), demo data policy (§3), location: new folder
`C:\Users\MrigankarSonowal\ECKSTEIN\Financial Model\milestone\`.

**Left to builder:** component breakdown, state shape, exact chart styling, S-curve formula, test
layout, whether the engine moves to a Web Worker (only if a run takes > 50 ms).

**Skills to use while building:** frontend-design, ui-ux-pro-max, dataviz, vercel:shadcn,
vercel-react-best-practices, test-driven-development (engine), web-design-guidelines / accessibility
scan, run (launch & screenshot), verification-before-completion.
