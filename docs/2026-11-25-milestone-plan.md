# Milestone (HAM Bid Modeller demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite/React/TypeScript single-page demo that re-imagines the V16 HAM bid workbook as an interactive, Stripe/Ramp-grade modeller with live recalculation, health checks, scenarios and charts.

**Architecture:** A pure, deterministic TypeScript engine (`src/engine`, no React imports) turns an `Inputs` object into a `ModelResult` and a list of `Check`s. A field registry (`src/fields.ts`) describes every input once and drives forms, validation, ⌘K search and jump-to-field. A Zustand store holds scenarios (persisted to localStorage); React views read `runModel(activeInputs)` via a memo hook and render sections + Recharts charts.

**Tech Stack:** Node ≥ 20, Vite 5.4, React 18.3.1, TypeScript 5.6 (strict), Tailwind CSS 3.4, shadcn/ui (Radix), cmdk 1.0, lucide-react, Recharts 2.13, Zustand 5, Vitest 2.1 + @testing-library/react 16 + jsdom.

**Spec:** `docs/2026-11-25-milestone-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- Project root: `C:\Users\MrigankarSonowal\ECKSTEIN\Financial Model\milestone\`; `git init` there. Every commit authored as `Mrigankar Sonowal <53226534+Mrigankar1134@users.noreply.github.com>`; **no** `Co-Authored-By` or "Generated with" lines (user's CLAUDE.md overrides).
- Engine files import nothing from React/DOM. All engine functions are pure.
- Dates: ISO strings `YYYY-MM-DD` in `Inputs`; engine arithmetic uses `Day` = integer days since 1970-01-01 **UTC** (never local time).
- Money in ₹ crore; display via `en-IN` grouping, 2 dp, e.g. `₹2,250.00 Cr`; percentages 2 dp (`9.82%`); multiples `1.47×`; dates `08 Jul 2026`.
- No client/contractor name anywhere. Default project name `Sample Greenfield Corridor – Pkg 2`; authority `Authority (demo)`; a visible "Demo data" badge in the top bar.
- Field names follow spec §6 renames (Bid Price, Authority Estimate, Construction Support, Completion Payments, Indexation Factor, Annuity Rate, Loan Rate – Build/Operate, Debt Service Reserve, Resurfacing year, Interest During Build, Performance Security, Build Milestones, Financing Tie-up Test, Health).
- No plugs, no per-period overrides, no hardcoded numbers in engine logic — every number is an `Inputs` field or a named constant with a comment.
- Visual: light neutral canvas, white cards, 1px hairline borders, 10–12px radius, Inter with `font-variant-numeric: tabular-nums`, one indigo accent + semantic green/amber/red, dark mode, WCAG AA, respects `prefers-reduced-motion`.
- Skills while building UI: frontend-design, ui-ux-pro-max, dataviz, vercel:shadcn, vercel-react-best-practices; at the end web-design-guidelines + accessibility scan, run, verification-before-completion.

## Review Focus

1. **Half-typed or invalid field entry** (`""`, `"-"`, `"1,2,"`, `"abc"`): the model keeps the last valid value, the field shows an inline error, and no KPI/chart ever shows `NaN`/`Infinity`. → test in Task 10.
2. **Inputs with no IRR root** (e.g. Bid Price 100, all-negative flows): `xirr` returns `null`, KPIs show `—`, Health flags it, no throw or hang. → tests in Tasks 1 and 6.
3. **List inputs of wrong sum/length** (repayment ≠ 100%, 29 installments): engine still runs without throwing; Health shows an error naming the list and its actual sum. → test in Task 7.
4. **Stale or corrupt localStorage** (old scenario missing new fields, invalid JSON, storage access throws in private mode): scenarios load merged over defaults; app works in memory. → test in Task 9.
5. **Unreachable solve target** (target equity IRR 60%): solver returns `{ ok: false, reason }` within its run cap; UI says "not reachable between ₹X and ₹Y Cr". → test in Task 8.

---

### Task 1: Scaffold + date and finance utilities

**Files:**
- Create: `milestone/` via `npm create vite@5 milestone -- --template react-ts`; add deps; `vitest.config.ts` (jsdom, globals); `src/engine/dates.ts`, `src/engine/finance.ts`
- Test: `src/engine/dates.test.ts`, `src/engine/finance.test.ts`

**Interfaces:**
- Produces:
  - `type Day = number`
  - `toDay(iso: string): Day`, `toIso(d: Day): string`, `addDays(d: Day, n: number): Day`, `addMonths(d: Day, n: number): Day` (clamps to month end like Excel EDATE), `eomonth(d: Day): Day`, `fyEnd(d: Day): Day` (31 Mar of the Indian FY containing d), `yearsBetween(a: Day, b: Day): number` ((b−a)/365)
  - `xirr(flows: { day: Day; amount: number }[]): number | null` — Newton from 0.1, bisection fallback on [−0.99, 10]; `null` if flows lack both signs or no root
  - `npv(rate: number, flows: { day: Day; amount: number }[]): number` (XNPV, base = first day)

- [ ] **Step 1:** Scaffold, install: `npm i zustand@5 recharts@2.13 cmdk@1 lucide-react clsx tailwind-merge` and `npm i -D vitest@2.1 jsdom @testing-library/react@16 @testing-library/jest-dom tailwindcss@3.4 postcss autoprefixer`; add scripts `"test": "vitest run"`, `"typecheck": "tsc -b --noEmit"`. `git init`, set local user.name/email per Global Constraints.
- [ ] **Step 2: Write failing tests**

```ts
expect(toIso(addMonths(toDay('2026-01-31'), 1))).toBe('2026-02-28')
expect(toIso(fyEnd(toDay('2026-07-08')))).toBe('2027-03-31')
expect(toIso(fyEnd(toDay('2027-03-31')))).toBe('2027-03-31')
expect(toIso(addDays(toDay('2027-03-20'), 1094))).toBe('2030-03-18')
// xirr: -100 today, +110 in 365 days -> 10%
expect(xirr([{day:0,amount:-100},{day:365,amount:110}])!).toBeCloseTo(0.10, 6)
expect(xirr([{day:0,amount:-100},{day:365,amount:-5}])).toBeNull()      // Review Focus 2
expect(xirr([{day:0,amount:-100},{day:365,amount:1}])!).toBeCloseTo(-0.99, 1) // deep negative still finite
expect(npv(0.1,[{day:0,amount:-100},{day:365,amount:110}])).toBeCloseTo(0, 6)
```
- [ ] **Step 3:** Run `npx vitest run src/engine` → FAIL (modules missing).
- [ ] **Step 4:** Implement both files (UTC via `Date.UTC`).
- [ ] **Step 5:** Run `npx vitest run src/engine` → PASS; `npm run typecheck` → no errors.
- [ ] **Step 6:** Commit `chore: scaffold milestone app with date and xirr utilities`.

### Task 2: Inputs types, defaults, field registry

**Files:**
- Create: `src/engine/types.ts`, `src/engine/defaults.ts`, `src/fields.ts`, `src/lib/path.ts`
- Test: `src/fields.test.ts`

**Interfaces:**
- Produces `Inputs` (all money ₹ Cr, rates as fractions):

```ts
export type SectionId = 'overview'|'deal'|'build'|'capital'|'income'|'operations'|'returns'|'health'|'scenarios'
export type Pavement = 'flexible'|'flexiblePerpetual'
export interface Inputs {
  deal: { projectName: string; authorityName: string; bidPrice: number; authorityEstimate: number; lengthKm: number;
          bidDate: string; daysToAward: number; daysToAgreement: number; daysToStart: number; buildDays: number;
          operateYears: number; pavement: Pavement }
  milestones: { day: number; physical: number; financial: number }[]
  build: { epcFixed: number; gstWorks: number; gstServices: number; ieFeePctOfBid: number; adminPctOfEpc: number;
           fundRaisingPctOfDebt: number; financeLegal: number; contingency: number; preBid: number; preBidMiscPct: number;
           spvFormationPctOfShareCapital: number; patrolCapital: number; patrolRental: number;
           perfSecurityPctOfBid: number; perfSecurityCommissionPa: number; phasing: 'equated'|'sCurve' }
  support: { pctOfBid: number; tranches: { progress: number; shareOfBid: number }[] }
  capital: { equityPct: number; upfrontEquityPct: number; shareCapitalPct: number; buildRate: number; operateRate: number;
             repayment: number[]; maxLeverage: number; dscrWarn: number }
  income: { completionPctOfBid: number; installments: number[]; firstPaymentLagDays: number; bankRates: number[];
            spread: number; rateQuoteDate: string; maxQuoteAgeMonths: number; omBaseRate: number; omResurfacingRate: number;
            omPreResurfacingFlexible: number; omPreResurfacingPerpetual: number }
  indexation: { wpi: number; cpi: number; wpiWeight: number }
  operations: { routine: number; electricity: number; financeLegal: number; staff: number; patrolRunning: number; ieFee: number;
                insuranceBaseRate: number; insuranceLoading: number; majorMaintenance: number; resurfacingYears: [number, number];
                inflation: { maintenance: number; staff: number; electricity: number; insurance: number } }
  tax: { baseRate: number; surcharge: number; cess: number }
  targets: { equityIrrHurdle: number }
}
export interface FieldDef { id: string /* dotted path, e.g. 'deal.bidPrice', 'capital.repayment' */; label: string; section: SectionId;
  group: string; kind: 'money'|'percent'|'days'|'years'|'number'|'date'|'text'|'select'|'percentList'; min?: number; max?: number;
  step?: number; help?: string; options?: { value: string; label: string }[]; key?: boolean /* slider lever */ }
```
  - `DEFAULT_INPUTS: Inputs` — values from spec §7 "Headline defaults", Uses, Sources, Income, Operations cost, Senior debt, Tax. Exact extras: `gstWorks 0.18, gstServices 0.18, preBid 0.2904, preBidMiscPct 1 (workbook's 100% allowance, now visible and editable), financeLegal 4.21, contingency 5, patrolCapital 1.03, patrolRental 0.846, spvFormationPctOfShareCapital 0.0025, perfSecurityPctOfBid 0.05, perfSecurityCommissionPa 0.015, daysToAward 60, daysToAgreement 45, daysToStart 150, firstPaymentLagDays 180, maxQuoteAgeMonths 3, maxLeverage 3, dscrWarn 1.10, routine 2.3104, electricity 1.8705, financeLegal(ops) 1.42, majorMaintenance 27.8278, insuranceBaseRate 0.0014, insuranceLoading 2.15, tranches = progress [0.05,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9] × shareOfBid 0.04`; `bankRates [0.087,0.0835,0.0835,0.087,0.0875]`; installments and repayment arrays as in spec §7 (repayment written so it sums to exactly 1: last value 0.046).
  - `FIELDS: FieldDef[]` covering every leaf of `Inputs` (lists as one `percentList` field each); `fieldById(id: string): FieldDef | undefined`
  - `getAt(obj: object, path: string): unknown`, `setAt<T>(obj: T, path: string, value: unknown): T` (immutable)

- [ ] **Step 1: Write failing tests** — `every leaf path of DEFAULT_INPUTS has exactly one FieldDef` (walk object; arrays count as leaves); `every FieldDef id resolves via getAt to a defined value`; `sum(DEFAULT_INPUTS.capital.repayment)` toBeCloseTo 1, 10 and `installments` sum toBeCloseTo 1, 10 (if the spec's installment array sums to 0.9999…, add the rounding residue to the last element and note it in a comment as the published schedule rounded to 2 dp); `setAt` does not mutate the original.
- [ ] **Step 2:** `npx vitest run src/fields.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Labels use §6 names; `help` text explains each field in one sentence; `key: true` for bidPrice, epcFixed, buildRate, operateRate, bank rates, wpi, cpi, routine, majorMaintenance.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(engine): inputs model, defaults and field registry`.

### Task 3: Timeline and indexation

**Files:** Create `src/engine/timeline.ts`; Test `src/engine/timeline.test.ts`

**Interfaces:**
- Consumes: Task 1 date utils, Task 2 `Inputs`.
- Produces:

```ts
export interface Timeline { bid: Day; award: Day; agreement: Day; start: Day; completion: Day; firstPayment: Day; end: Day;
  months: Day[] /* month-end days from eomonth(start) to eomonth(completion) */; payments: Day[] /* 30 dates, 6 months apart */ }
export function buildTimeline(i: Inputs): Timeline
export function indexRate(i: Inputs): number            // wpiWeight*wpi + (1-wpiWeight)*cpi
export function indexFactor(i: Inputs, d: Day): number  // (1+indexRate)^(yearsBetween(bid,d)), 1 for d<=bid
```
- [ ] **Step 1: Failing tests** with defaults: award `2026-09-06`, agreement `2026-10-21`, start `2027-03-20`, completion `2030-03-18` (start + buildDays − 1), firstPayment `2030-09-14` (completion + 180), `payments.length === 2 * operateYears`, `payments[1] === addMonths(payments[0], 6)`, end `2045-03-18`, `months.length === 37`, `indexFactor(i, bid) === 1`, `indexFactor` one year later toBeCloseTo 1.04.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(engine): timeline and indexation`.

### Task 4: Build-period engine (uses, sources, Interest During Build solver)

**Files:** Create `src/engine/build.ts`; Test `src/engine/build.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `indexFactor`.
- Produces:

```ts
export interface UseLine { key: string; label: string; net: number; gst: number }   // per-line totals
export interface BuildMonth { day: Day; epc: number; otherUses: number; gstPaid: number; idc: number; supportReceived: number;
  supportGst: number; equityDraw: number; debtDraw: number; debtBalance: number; cumPhysical: number; cumCost: number; cumFunding: number }
export interface BuildResult { months: BuildMonth[]; uses: UseLine[]; totalUses: number; support: number; supportGst: number;
  equity: number; shareCapital: number; promoterDebt: number; debt: number; idc: number; reserve: number; workingCapital: number;
  netGstCredit: number; converged: boolean; iterations: number }
export function runBuild(i: Inputs, t: Timeline, firstPeriod: { debtService: (debt: number) => number; opex: number; interest: (debt: number) => number }): BuildResult
```
`firstPeriod` is supplied by Task 6 so the reserve (= first-period debt service) and working capital (= first-period opex + first-period interest) can be sized inside the loop.

- [ ] **Step 1: Failing tests** (defaults, a stub `firstPeriod` with `debtService: d => d*0.07, opex: 7, interest: d => d*0.0475`):
  - `sum(months.epc) ≈ epcFixed*(1+gstWorks) + variable EPC` and EPC variable equals `Σ tranche base × (indexFactor−1)` (pass-through: also appears in `supportReceived`).
  - sources = uses: `|support + supportGst + equity + debt − totalUses| < 0.01`.
  - `equity/(equity+debt)` toBeCloseTo `equityPct`, 6; cumulative equity in month 0..k ≥ upfront equity before any debt is drawn.
  - `converged === true`, `iterations <= 50`; `idc > 0`; `months.every(m => m.debtBalance >= 0)`.
  - support tranche k lands in the first month where `cumPhysical >= tranches[k].progress`.
  - `months.at(-1)!.cumPhysical` toBeCloseTo 1.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Algorithm (not determined by the tests):
  - EPC phasing per month: `equated` = share of build days falling in that month; `sCurve` = difference of `0.5 − 0.5·cos(π·x)` at month boundaries, x = elapsed/buildDays. `cumPhysical` = cumulative fixed-EPC share.
  - Other uses timing: pre-bid = `preBid × (1 + preBidMiscPct)` (label "Pre-bid costs incl. miscellaneous allowance") and SPV formation in month 0; fund-raising fee and finance & legal in month 0; IE fee, admin, patrol rental, performance-security commission equated over months; patrol capital in second-last month; contingency in last month; reserve and working capital in last month. GST: `gstWorks` on EPC, `gstServices` on IE fee, fund raising, finance & legal, pre-bid, patrol rental; none on admin, contingency, patrol capital, formation.
  - Support tranche base = `shareOfBid × bidPrice`; received = base × indexFactor(month); variable EPC paid same month = base × (indexFactor − 1); `supportGst = gstWorks × received`.
  - Fixed point over `D` (total debt): given D → fund-raising fee, reserve = `debtService(D)`, WC = `opex + interest(D)`; walk months: need = uses + IDC(month) − support − supportGst − cash carried; IDC(month) = opening debt × buildRate × daysInMonth/365; equity first until `upfrontEquityPct × E`, then split `equityPct : 1−equityPct`; surplus cash carries forward. `E` and `D` from total need × equityPct. Iterate until |ΔD| < 0.01 (₹1 lakh) or 50 iterations.
  - `netGstCredit = Σ gstPaid − supportGst` (floored at 0).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(engine): build-period sources & uses with IDC fixed point`.

### Task 5: Operations engine (income, opex, debt, reserve, tax)

**Files:** Create `src/engine/operations.ts`; Test `src/engine/operations.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `indexFactor`, `BuildResult` fields `debt`, `reserve`, `workingCapital`, `netGstCredit`, `totalUses`, `support`, `supportGst`.
- Produces:

```ts
export function omSchedule(i: Inputs): number[]       // per operating year, spec §7 derivation
export function annuityRate(i: Inputs): number        // mean(bankRates) + spread
export function opexForYear(i: Inputs, year: number, d: Day): { routine: number; electricity: number; financeLegal: number;
  staff: number; patrolRunning: number; ieFee: number; insurance: number; majorMaintenance: number; total: number } // annual amounts at date d
export interface OpsPeriod { n: number; day: Day; year: number; completionPayment: number; interestIncome: number; omPayment: number;
  gstRecovery: number; opex: number; tax: number; cfads: number; debtOpening: number; principal: number; interest: number;
  debtClosing: number; reserveBalance: number; reserveMovement: number; wcRelease: number; equityCash: number; dscr: number | null;
  balanceOutstanding: number }
export function runOperations(i: Inputs, t: Timeline, b: Pick<BuildResult,'debt'|'reserve'|'workingCapital'|'netGstCredit'|'totalUses'|'support'|'supportGst'>): OpsPeriod[]
```
- [ ] **Step 1: Failing tests** (defaults, a stub build `{debt: 990, reserve: 60, workingCapital: 55, netGstCredit: 158, totalUses: 2465, support: 900, supportGst: 162}`):
  - `omSchedule(defaults)` equals `[0,0.004,0.004,0.004,0.006,0.024,0.004,0.004,0.004,0.004,0.006,0.024,0.004,0.004,0.004]`; with `pavement:'flexible'` index 4 and 10 are `0.008`; with resurfacing `[7,13]` index 6 and 12 are `0.024` and index 5 is `0.006`.
  - `annuityRate(defaults)` toBeCloseTo 0.0982, 6.
  - Σ completionPayment toBeCloseTo `completionPctOfBid × bidPrice × indexFactor(completion)`, 6; last `balanceOutstanding` toBeCloseTo 0.
  - Σ principal toBeCloseTo 990 and last `debtClosing` toBeCloseTo 0 when repayment sums to 1; periods > 25 have `dscr === null`.
  - Σ gstRecovery ≤ 158 and > 0.
  - major maintenance appears only in periods whose `year` ∈ resurfacingYears.
  - period 1 `wcRelease === 55`; reserve released to 0 by the period after the last repayment.
  - `tax >= 0` every period.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Period n (1..2·operateYears) at `payments[n−1]`, `year = ceil(n/2)`, length = days since previous payment (first: since completion). Income: completion = installments[n−1] × completionBase; interestIncome = opening outstanding × annuityRate/2; omPayment = omSchedule[year−1] × bidPrice × indexFactor(day)/2; gstRecovery = min(remaining credit, gstWorks × completion). Opex = annual `opexForYear(year, day).total` / 2 with each line inflated by its own rate from bid date (insurance = baseRate × loading × EPC excl. GST, inflation `insurance`); major maintenance split 50/50 across the two halves of each resurfacing year. Debt: principal = repayment[n−1] × debt (n ≤ repayment.length); interest = opening × operateRate × periodDays/365. Reserve target = next period's principal + interest (0 after the last); movement = target − previous balance (initial balance = `reserve`). Tax: taxable = completion + interestIncome + omPayment − opex − interest − amortisation (amortisation = (totalUses − support − supportGst − netGstCredit)/periods), carry losses forward, tax = max(0, taxable after losses) × baseRate × (1+surcharge) × (1+cess). `cfads = completion + interestIncome + omPayment + gstRecovery − opex − tax`; `dscr = cfads/(principal+interest)` when debt service > 0; `equityCash = cfads − principal − interest − reserveMovement + wcRelease`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(engine): operations income, opex, debt, reserve and tax`.

### Task 6: runModel, returns, KPIs, calibration

**Files:** Create `src/engine/model.ts`; Test `src/engine/model.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:

```ts
export interface Kpis { projectIrrPre: number|null; projectIrrPost: number|null; equityIrr: number|null; dscrMin: number|null; dscrAvg: number|null;
  totalProjectCost: number; support: number; debt: number; equity: number; leverage: number; omMargin: number; completionCostBase: number }
export interface ModelResult { inputs: Inputs; timeline: Timeline; build: BuildResult; ops: OpsPeriod[]; kpis: Kpis }
export function runModel(i: Inputs): ModelResult
```
- [ ] **Step 1: Failing tests:**
  - `runModel(DEFAULT_INPUTS)` completes in < 50 ms (measure with `performance.now()`, averaged over 5 runs).
  - Calibration band (spec §7): equityIrr ∈ 0.151 ± 0.015, projectIrrPre ∈ 0.118 ± 0.015, projectIrrPost ∈ 0.104 ± 0.015, dscrMin ∈ 1.20 ± 0.15, dscrAvg ∈ 1.47 ± 0.15. On failure the test prints a table of each KPI vs target (not a silent fail).
  - `kpis.leverage` toBeCloseTo `debt/equity`; `dscrAvg = Σcfads/Σdebt service` over serviced periods.
  - Review Focus 2: `runModel({...DEFAULT_INPUTS, deal:{...DEFAULT_INPUTS.deal, bidPrice: 100}})` does not throw and every IRR is `number|null` with no `NaN`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** `firstPeriod` for runBuild: debtService(D) = repayment[0]·D + D·operateRate·180/365; interest(D) = D·operateRate·180/365; opex = opexForYear(1, completion).total/2. Project flows: build months −(equityDraw+debtDraw) at month day; ops: post-tax = cfads + wcRelease − reserveMovement (reserve is a project asset funded in build); pre-tax adds back tax. Equity flows: −equityDraw; +equityCash. `omMargin = Σ omPayment − Σ opex`. All IRRs via `xirr`.
- [ ] **Step 4:** Run → PASS. If the calibration band fails, investigate per spec (each deliberate difference listed in §8) before widening anything; widening requires a comment naming the cause. **Step 5:** Commit `feat(engine): runModel with XIRR returns and calibration test`.

### Task 7: Health checks and input validation

**Files:** Create `src/engine/health.ts`; Test `src/engine/health.test.ts`

**Interfaces:**
- Consumes: `ModelResult`, `FIELDS`, `getAt`.
- Produces:

```ts
export type Severity = 'error'|'warning'|'info'
export interface Check { id: string; title: string; section: SectionId; fieldId?: string; severity: Severity; pass: boolean; message: string }
export function validateInputs(i: Inputs): Check[]        // ids 'field:<fieldId>' and cross-field rules
export function runChecks(r: ModelResult): Check[]         // spec §9 items 2–12, includes validateInputs
export function healthScore(checks: Check[]): { passed: number; total: number; errors: number; warnings: number }
```
Check ids: `financing-tieup`, `milestone-progress-1..4`, `milestone-funding-1..4`, `dscr-floor`, `dscr-warn`, `debt-repaid`, `repayment-sum`, `installment-sum`, `tranche-sum`, `rate-quote-fresh`, `aps-trigger`, `leverage`, `sources-uses`, `build-cash`, `om-margin`, `solver-converged`, `equity-hurdle`, `resurfacing-order`, `dates-order`.

- [ ] **Step 1: Failing tests:**
  - defaults → no `error` fails; `om-margin` is a failing `warning` (workbook O&M loss ~₹20 Cr), message contains the amount.
  - Review Focus 3: repayment with last element removed → engine runs, `repayment-sum` fails with message containing `95.40%`; installments of length 29 → `installment-sum` fails, no throw.
  - `rate-quote-fresh`: quote date `2026-03-01` with bid `2026-07-08` fails; result independent of `Date.now()` (mock it to 2030 → defaults still pass).
  - `financing-tieup` threshold = min(0.9×(authorityEstimate − 0.4×bid), 0.6×bid) = 1154.84 at defaults; set equityPct so debt+equity < threshold → fails.
  - `aps-trigger` with bid 1,800 (17.55% below 2,183.15) → info, pass=false, message shows `0.8%` of bid (rounded 8 pts × 0.1%) = `₹14.40 Cr`.
  - `field:deal.buildDays` fails for 100 (min 365) with message naming the limit; `resurfacing-order` fails for `[6, 9]` (needs second > first + 5) and `[6, 16]` (≥ operateYears).
  - every failing check with a `fieldId` resolves via `fieldById`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (milestone funding check compares cumulative funding vs cumulative cost at each milestone day and reports the excess amount — never clips). **Step 4:** Run → PASS. **Step 5:** Commit `feat(engine): health checks and validation`.

### Task 8: Solve Bid Price and sensitivity

**Files:** Create `src/engine/solve.ts`, `src/engine/sensitivity.ts`; Test `src/engine/solve.test.ts`

**Interfaces:**
- Produces:

```ts
export type SolveResult = { ok: true; bidPrice: number; equityIrr: number; runs: number } | { ok: false; reason: string; runs: number }
export function solveBidPrice(i: Inputs, targetEquityIrr: number, range?: [number, number]): SolveResult // default range [0.5×, 1.5×] current bid, bisection, ≤ 40 runs, tol 0.0001
export interface TornadoBar { key: string; label: string; low: number|null; high: number|null; base: number|null }
export function tornado(i: Inputs, metric: (r: ModelResult) => number|null, pct?: number): TornadoBar[] // ±10% on bidPrice, epcFixed, bankRates (all), operateRate, wpi&cpi, all operations cost lines; sorted by |high−low| desc
```
- [ ] **Step 1: Failing tests:** solving for the default equity IRR returns bid within ±₹1 Cr of 2,250; result `runs <= 40`; Review Focus 5: target 0.60 → `{ok:false}` with reason containing both range ends formatted `₹1,125.00 Cr` and `₹3,375.00 Cr`; tornado returns 6 bars, first bar has the largest spread, and the base matches `runModel` equity IRR.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; also check solve finishes in < 1 s. **Step 5:** Commit `feat(engine): bid price solver and tornado sensitivity`.

### Task 9: Store, formatting, app shell, routing, theme

**Files:**
- Create: `src/state/store.ts`, `src/state/useModel.ts`, `src/lib/format.ts`, `src/app/App.tsx`, `src/app/Sidebar.tsx`, `src/app/Topbar.tsx`, `src/app/router.ts`, `src/app/theme.ts`, `src/index.css` (Tailwind + CSS variables for both themes), shadcn init (`components.json`, `src/components/ui/*` as needed: button, card, input, select, slider, tooltip, dialog, dropdown-menu, badge, tabs, toast/sonner)
- Test: `src/state/store.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Scenario { id: string; name: string; inputs: Inputs; updatedAt: number }
interface Store { scenarios: Scenario[]; activeId: string; baseId: string; compareId: string | null;
  setInput(fieldId: string, value: unknown): void; resetField(fieldId: string): void; createScenario(name: string, from?: string): string;
  renameScenario(id: string, name: string): void; deleteScenario(id: string): void; setActive(id: string): void; setCompare(id: string|null): void;
  importScenario(json: string): { ok: boolean; error?: string } }
export const useStore: UseBoundStore<StoreApi<Store>>
export function mergeWithDefaults(raw: unknown): Inputs   // deep-merge onto DEFAULT_INPUTS, drop unknown keys, keep arrays only if numeric
export function useModel(): { active: ModelResult; base: ModelResult; checks: Check[]; score: ReturnType<typeof healthScore> }
export const fmt: { cr(n: number|null): string; pct(n: number|null, dp?: number): string; x(n: number|null): string; date(iso: string|Day): string; num(n: number|null, dp?: number): string } // null/NaN → '—'
export function useRoute(): { section: SectionId; focus?: string; go(section: SectionId, focusFieldId?: string): void } // hash '#/build?focus=build.epcFixed'
```
- [ ] **Step 1: Failing tests:** `fmt.cr(2250)` → `₹2,250.00 Cr`, `fmt.cr(1234567.891)` → `₹12,34,567.89 Cr`, `fmt.pct(0.0982)` → `9.82%`, `fmt.x(1.4667)` → `1.47×`, `fmt.date('2026-07-08')` → `08 Jul 2026`, `fmt.cr(NaN)` → `—`. Review Focus 4: `mergeWithDefaults({deal:{bidPrice:2000}, junk:1})` keeps 2000 and every other default; `mergeWithDefaults('not json')` returns defaults; store initialises when `localStorage.getItem` throws (stub it) and `setInput` still works in memory; `importScenario('{bad')` → `{ok:false}`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Zustand `persist` with a storage adapter wrapping every call in try/catch; `onRehydrateStorage` runs `mergeWithDefaults` on each scenario. Initial state: one scenario "Base case" (defaults) = active = base. Shell: fixed 240px sidebar (sections in §5 order with lucide icons and a coloured health dot per section from checks), top bar (scenario switcher dropdown, "Demo data" badge, health badge `n errors · m warnings` linking to Health, theme toggle, export menu placeholder wired in Task 13). Sections render placeholder headers for now. Use the frontend-design + ui-ux-pro-max skills to set tokens (spacing 4/8 scale, radius, shadow, colour tokens for light/dark).
- [ ] **Step 4:** `npm test` → PASS; `npm run dev` → shell renders, hash navigation switches sections, theme persists. **Step 5:** Commit `feat(ui): store, formatting and app shell`.

### Task 10: Form fields, jump-to-field, command palette

**Files:**
- Create: `src/components/fields/Field.tsx` (renders any `FieldDef` by kind), `NumberField.tsx`, `PercentListField.tsx`, `src/components/fields/parse.ts`, `src/app/CommandPalette.tsx`, `src/components/InputGroup.tsx` (card listing fields of a group)
- Test: `src/components/fields/parse.test.ts`, `src/components/fields/Field.test.tsx`

**Interfaces:**
- Consumes: `FIELDS`, `useStore`, `useModel().checks`, `useRoute`.
- Produces: `parseNumber(raw: string, kind: FieldDef['kind']): { ok: true; value: number } | { ok: false; error: string }` (percent kinds accept `9.82` meaning 0.0982, strip `,` and `₹`); `<Field id="deal.bidPrice" />`; `<InputGroup section="build" group="Hard costs" />`; DOM id for focus = `field-${id.replaceAll('.','-')}`.
- [ ] **Step 1: Failing tests:** Review Focus 1: `parseNumber('', 'money')`, `parseNumber('-', 'money')`, `parseNumber('1,2,', 'money')`, `parseNumber('abc','percent')` all `{ok:false}`; `parseNumber('2,250','money')` → 2250; `parseNumber('9.82','percent')` → 0.0982. Field test: typing `abc` into Bid Price shows an inline error, store value stays 2250, overview KPI text contains no `NaN`; field changed from base shows the "changed" dot and reset restores the base value; a field with a failing check shows the check message and `aria-invalid="true"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Inputs keep a local draft string; commit on valid parse (debounced 150 ms) or blur. Unit adornments (₹ Cr, %, days, yrs). `key` fields also render a slider (±50% of default, step from FieldDef). Percent lists render as a compact editable strip with live sum badge. Command palette (cmdk, ⌘K / Ctrl+K): groups Sections, Fields (label + section), Checks (failing first); selecting navigates via `go(section, fieldId)`; on route focus the section scrolls the field into view, focuses it and flashes a ring (no flash under reduced motion).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(ui): typed fields, validation display, command palette`.

### Task 11: Charts

**Files:**
- Create: `src/charts/theme.ts` (palette + axis/tooltip styles from the dataviz skill, both themes), `SourcesUsesChart.tsx`, `DrawdownChart.tsx`, `MilestoneChart.tsx`, `IncomeChart.tsx`, `DscrChart.tsx`, `DebtChart.tsx`, `EquityWaterfallChart.tsx`, `TornadoChart.tsx`
- Test: `src/charts/data.test.ts` with pure data mappers in `src/charts/data.ts`

**Interfaces:**
- Consumes: `ModelResult`, `TornadoBar[]`, `fmt`.
- Produces data mappers: `sourcesUsesData(r)`, `drawdownData(r)` (monthly stacked: support, equity, debt + milestone markers), `milestoneData(r)` (required vs projected physical & financial per milestone), `incomeData(r)` (per period: completion, interest, O&M), `dscrData(r)` (dscr + floor 1.00 + warn line), `debtData(r)`, `waterfallData(r)` (equity in → income → opex → tax → debt service → equity out), each chart component `({ result }: { result: ModelResult }) => JSX.Element` (Tornado takes `bars`).
- [ ] **Step 1: Failing tests:** `sourcesUsesData` totals equal (sources = uses within 0.01); `drawdownData` length = `timeline.months.length` and has 4 milestone markers; `dscrData` excludes null periods; `waterfallData` ends at Σ equityCash − equity.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement mappers, then charts (invoke dataviz skill first): `ResponsiveContainer`, tabular-number tooltips via `fmt`, accessible palette, legends, `isAnimationActive` off under reduced motion, empty/`null` states render a muted "No data" panel. **Step 4:** Run → PASS. **Step 5:** Commit `feat(ui): charts`.

### Task 12: Section views (Deal, Build, Capital, Income, Operations)

**Files:** Create `src/sections/Deal.tsx`, `Build.tsx`, `Capital.tsx`, `Income.tsx`, `Operations.tsx`, `src/components/DataTable.tsx` (compact, right-aligned numbers, sticky header, CSV-copy button), `src/components/Timeline.tsx` (deal timeline strip)
**Test:** `src/sections/sections.test.tsx`

**Interfaces:** Consumes `InputGroup`, charts, `useModel`, `fmt`.
Layout per section: header (title, one-line description, section health summary) → two-column grid on ≥ 1280px (inputs left 5/12, results right 7/12), stacked below.
- Deal: groups "Bid", "Dates", "Project"; results: Timeline strip, bid vs Authority Estimate %, Additional Performance Security card, Financing Tie-up card.
- Build: groups "Hard costs", "Soft costs", "Phasing", "Build Milestones"; results: uses table, DrawdownChart, MilestoneChart, GST credit card.
- Capital: groups "Structure", "Loan terms", "Repayment"; results: SourcesUsesChart, IDC + solver iterations, DebtChart, reserve card.
- Income: groups "Completion Payments", "Annuity Rate", "O&M Payments", "Indexation"; results: IncomeChart, period table, derived O&M schedule table.
- Operations: groups "Running costs", "Maintenance", "Insurance", "Inflation", "Tax"; results: opex by year table, O&M margin card.
- [ ] **Step 1: Failing test:** each section renders without errors with defaults and shows ≥ 1 chart or table; changing Bid Price in Deal updates the Income section's total completion payments text.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; visual check with `npm run dev`. **Step 5:** Commit `feat(ui): input sections`.

### Task 13: Overview, Returns, Health, Scenarios, export

**Files:** Create `src/sections/Overview.tsx`, `Returns.tsx`, `Health.tsx`, `Scenarios.tsx`, `src/components/KpiTile.tsx`, `src/components/SolveCard.tsx`, `src/lib/export.ts`; modify `src/app/Topbar.tsx` (export menu: Export scenario JSON, Import scenario JSON via file input → `importScenario`, Export schedules CSV)
**Test:** `src/sections/overview.test.tsx`, `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `solveBidPrice`, `tornado`, `healthScore`, store.
- Produces: `exportScenarioJson(s: Scenario): string`, `exportSchedulesCsv(r: ModelResult): string` (build months + ops periods, header row, ISO dates).
- Overview: KPI tiles (Equity IRR, Project IRR pre/post, Min DSCR, Avg DSCR, Total project cost) each with delta vs base scenario (green/red by direction of goodness), a sparkline, and a 300 ms number tween (instant under reduced motion); SolveCard (target IRR input, Solve button, result with "Apply" that sets Bid Price); mini Sources & Uses + DSCR charts; "Top issues" list (first 5 failing checks, click → jump).
- Returns: IRR table (pre/post, project/equity), DscrChart, EquityWaterfallChart, TornadoChart with metric toggle (Equity IRR / Min DSCR).
- Health: score ring, filters (All / Errors / Warnings / Info / Passed), grouped by section, each row: icon, title, message, "Go to field" button; toast (sonner) when a change flips any check (compare previous vs current check map).
- Scenarios: list with create/duplicate/rename/delete, set base, compare picker; compare view shows inputs that differ and KPI deltas side by side.
- [ ] **Step 1: Failing tests:** Overview shows `15.` prefix for equity IRR at defaults within calibration band (assert text matches `/1[3-7]\.\d{2}%/`); applying a solve result updates Bid Price; CSV has a header and `ops.length + build.months.length` data rows; JSON export → `importScenario` round-trips to equal inputs.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(ui): overview, returns, health, scenarios and export`.

### Task 14: Polish, accessibility, verification, README

**Files:** Modify any UI files flagged; Create `milestone/README.md` (run, test, build, what's simplified vs the workbook — copy spec §2 non-goals and §8 table)
- [ ] **Step 1:** Run the design-audit / web-design-guidelines skills over the running app; fix spacing, hierarchy, empty states, loading of charts, focus rings, contrast in both themes.
- [ ] **Step 2:** Run an accessibility scan (accessibility-scan skill) on each section in light and dark; fix every error-level finding.
- [ ] **Step 3:** Use the run skill to launch and screenshot Overview, Build, Capital, Returns, Health at 1440px and 390px wide; confirm no horizontal scroll at 390px.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → all succeed; paste the output.
- [ ] **Step 5:** Commit `chore: polish, a11y fixes and README`.
