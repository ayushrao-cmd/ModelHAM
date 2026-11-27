# Milestone — Original-method engine, IGAAP & IndAS statements, drill-down · Design

Date: 2026-11-27 · Supersedes the "simplified statements" of `2026-11-25-statements-phasing-design.md` and the
engine mechanics of `2026-11-25-milestone-design.md` where they conflict. Projects, cookies, gating, UI shell and
section structure stay as designed.

## 1. Intent

The client compared the site with the original workbook (`20260707_V16_HAM Bid FM_…_1129.xlsx`, "V16") and the
numbers differ. They asked for:
- (a) the three financial statements **as per IGAAP, as in the model**;
- (b) the three financial statements **as per IndAS, as in the model**;
- (c) clicking a statement line shows the sub-items that make it up, with amounts.

User decisions (asked): **match the original's numbers and the way the original calculates them**; the sample goes back
to the original's inputs (bid ₹2,250 Cr, support received in the month earned — done, `46bd1c9`).

Recon (cell-level, verified against cached values) lives outside the repo in `Financial Model/docs/recon/`:
`A-construction.md`, `B-operations.md`, `C-statements.md`. It shows the site's 15.09% equity IRR matched V16 only by
offsetting errors (completion base 1,560.58 vs 1,480.71; debt 970.62 vs 990.25; tax 298.11 vs 272.80). So matching
the statements means **porting V16's calculation engine**, not re-laying out the current one.

## 2. Goals, non-goals, anti-goals

Goals
- One engine that reproduces V16 at the sample to **₹0.01 Cr on every statement cell and every FY**, IRRs to 1e-6,
  DSCRs to 1e-4, and the monthly construction draws to ₹0.001 Cr.
- The same engine agrees with V16 **off the sample** too (other bids, EPC, build days, equity %, rates): proven by
  driving V16 itself through Excel COM and comparing (§7).
- IGAAP and IndAS statements on the site, each with P&L, Balance Sheet, Cash Flow (direct, construction and operation
  blocks as V16), plus the DSCR and IRR blocks; every line expandable to its sub-items.
- Headline KPIs become V16's: project IRR pre/post (annual IRR, 11.76% / 10.43%), equity IRR (half-yearly XIRR,
  15.09%), DSCR annual (min 1.197, avg 1.467). Other V16 IRR variants shown on Returns.

Non-goals: deferred tax under IndAS (V16 has none; offered as a later option); V16 features that are switched off
in the sample and absent from the site today (Authority mobilisation advance, interim debt, margin deposits, WDV tax
depreciation, MM provisioning) — they stay out unless asked; the Termination, Valuation, InvIT and IRR-movement
sheets.

Anti-goals: two engines that disagree on a headline number; a statement that balances only because of a plug; a
"match" that holds only at the sample.

## 3. Approaches considered

1. **Port V16 into the site's engine (picked).** One set of numbers everywhere; statements, KPIs and Health agree.
   Cost: every KPI and screen number changes; large engine work.
2. Keep the current engine and add a second V16-method engine just for statements. Rejected: Overview would say one
   equity IRR and the statements imply another (anti-goal).
3. Re-lay out the current statements in V16's format. Rejected by the user ("match the numbers and how it calculates").

## 4. Engine (pure TS, `src/engine/`), by recon gap ids

Grids: monthly construction from appointed date (37 months, last partial) **plus post-COD months to the 1st annuity**
(A-G2); COD = construction end + 1, 1st annuity = COD + 180, annuity 30 = concession end (B-G1); half-yearly annuity
dates; **FY layer** (31 March) for everything annual, with V16's concession-year→FY split and operation factors
(B-G2, C-2).

Construction (`build.ts`, rewritten): manual EPC phasing by month index as the sample default, equated/S-curve kept
(A-G3); grant earned in the month progress is crossed, crossing date interpolated, simple-interest PIM from
EOMONTH(bid,−1) (A-G4/G5); admin on fixed + variable EPC; SPV manpower; PSBG commission to its release date with its
circular release test; finance & legal over the 31-March months; pre-bid default 0.290409 (A-G7…G11); IDC on the
average balance with an inner per-month solve (A-G12); V16 draw rule — upfront equity, debt-first to 75% counting the
STL balance, then 25:75; share capital before USL (A-G13, G18); **STL / mobilisation advance ledger** (10% of bid,
2 instalments, repaid 12.5% at grant milestones 1–8, back-to-back interest) (A-G14); post-COD funding of interest and
O&M to the 1st annuity at the CP rate (A-G15/G16); DSR funded at COD from the ops interest schedule (A-G17); GST
input/credit ledger (A-G19); one outer fixed point over debt/equity, PSBG release date and the post-COD months
(A-G20).

Operations (`operations.ts`, rewritten): completion base = Σ milestone% × bid × PIM − grant with PIM (B-G3); interest
4.91% per half-year; O&M payments on the PIM series (B-G5); bonus (0 at sample); opex per head on concession-year bases,
FY split, FY-end inflation indices, GST per head (B-G7/G8); full GST ledger (B-G9); monthly senior debt with the
COD→1st-annuity tranche at 9.75%, then 9.5%, average-balance interest, actual/365-366 (B-G10); **DSR** two ledgers,
**Funds for Expenses** three ledgers (5.3845 months), **MMR** (20% × 5 FYs ahead of each resurfacing, generalised from
V16's hard-coded columns so the sample is identical), all earning the **FD rate 5.5%** → "Interest accrued on funds"
(B-G11…G14); **CSR** (B-G15); book depreciation **revenue-based**, tax depreciation SLM 15 years, loss carry-forward,
25.168% (B-G16/G17); annual CFADS, DSCR FY31–FY43 (B-G18); **no distributions — cash retained**; equity-IRR flows
spread over annuity month-ends as V16 (B-G19); annual project IRR (B-G20). Circular loops (expense-fund tax ↔
interest income ↔ tax) solved by a short fixed point.

Statements (`statements.ts`, rewritten): `buildStatements(r, standard: 'igaap' | 'indas')` returns P&L, BS, CF, DSCR,
IRR blocks with V16's row ids, labels, grouping and sign convention (C-2, C-3). IndAS: notional construction revenue =
EPC cost, CP costs/IDC/STL interest expensed, **financial asset** at its own IRR-derived rate (5.9614% at sample)
closing at zero, IGAAP tax copied (as V16), IndAS CSR from IndAS profit (C-5). Each `Row` carries
`children: Row[]` — the V16 drill-down tree (C-8): revenue → instalments by date; opex → per-head; depreciation →
base × revenue share; tax → PBT, +book dep, −tax dep, −b/f loss, × rate; every BS line → opening, movements, closing;
every CF line → its source rows; DSCR and IRR → their build-up.

Checks: V16's own (BS check, cash ≥ 0, Σ equity inflow = closing cash, equity and debt tie) plus the existing input and
model checks re-pointed at the new series.

## 5. Quirks

V16 has ~27 flagged quirks (A-Q1…Q12, B-Q1…Q15). Rule: **reproduce every quirk that changes a number at V16's inputs**
(that is what "match" means), and **generalise hard-codes** so other inputs behave as the formula intends (e.g. the
first-FY cell keyed to a hard-coded bid date; MMR % columns; the "10%" STL-equity cell). Each reproduced quirk is listed
on a new Health "Method notes" group (info severity) with the consistent alternative where it matters (e.g. average
DSCR 1.4667 per V16; 1.4250 on a consistent basis). No silent fixes.

## 6. Inputs and UI

New fields (appended to `FIELDS`; prefill class in brackets): STL % of bid [policy 10%], STL rate (= build rate),
mobilisation-advance option (STL only for now); FD rate on funds [policy 5.5%]; expense-fund period [policy 180 days];
MMR set-aside share and years [policy 20%, 5]; CSR on/off, rate, thresholds [policy]; tax depreciation life [policy 15];
DSR months [policy]; manual EPC phasing list [project data]; SPV manpower in construction [project data]; PIM rate
[standard 4%]. Defaults = V16's sample. Blank-project persistence: new blank-class fields need the persist version
bump and migration called out in `projects.ts`.

Statements section: a standard switch **IGAAP | IndAS** (URL `?std=`), tabs P&L · Balance Sheet · Cash Flow · DSCR ·
IRR, FY columns FY27…FY45 plus Total, V16 row numbering (A.1, B.3 …). A line with children shows a chevron; click
expands inline (nested, keyboard accessible, amounts per FY); a side panel shows the formula in words and the source.
Check banner per statement (balances / reconciles). CSV copy keeps the tree flattened with depth.

Other screens follow the new numbers; Returns lists all V16 IRR variants; DSCR chart becomes annual.

## 7. Verification

- **Golden files** extracted from V16's cached values at the sample: every Fin-IGAAP and Fin-INDAS statement row by FY,
  COP-MOF monthly draws, Debt, Revenue, KPIs. Engine tests compare to the tolerances in §2.
- **Differential runs**: a script drives V16 in Excel (COM, iterative calc on) through ≥ 6 input sets (bid 2,400;
  EPC +5%; build 1,460 days; equity 30%; rates +50 bp; phasing S-curve), saves goldens, and the engine must match
  them too. This is what proves "how the original calculates", not just the sample's answers.
- Existing invariants keep holding: BS balances every FY under both standards, cash ties, sources = uses.

## 8. Phases

1. Golden extraction + differential harness. 2. Construction engine. 3. Operations engine. 4. Statements (IGAAP,
IndAS) + drill-down data. 5. UI (Statements section, KPIs, Returns, Health, inputs). 6. Excel twin regenerated to the
new method with **live formulas** (user decision): every sheet recalculates in Excel, iterative calc for the
loops, no VBA; IGAAP and IndAS statement sheets added; `verify_excel.py` compares KPIs and both statement sets to
the engine at ₹0.01 Cr. 7. Guide refresh. Each phase
lands with green tests; push to main at the end of phases 5, 6 and 7.

## 9. Calls made after the builder check (author's calls, flagged for review)

- **Hard-codes in differential runs.** The engine follows V16's general formulas. Where an input set makes a V16
  hard-code wrong (e.g. MMR % columns when build days move COD into another FY), the harness drives a copy of V16 with
  that cell patched to the generalised rule, and the patch is listed in the run's report. The unpatched V16 is still
  the golden at the sample.
- **Inputs without a V16 counterpart.** Tranches, repayment schedule, bank rates, milestones, tie-up test and APS all
  exist in V16 and stay (re-pointed). The WPI/CPI blend becomes V16's PIM rate (4% = the sample blend); the blend
  fields stay as inputs that set it. The Interest During Build circularity switch is removed from the site (the engine
  always solves). Solve Bid Price and sensitivities stay; budget: one engine run ≤ 50 ms at the sample, so Solve
  (≤ 40 runs) stays under 2 s.
- **Input range.** FY columns, the DSCR window (the repayment FYs) and the annuity count follow the inputs, as today.
  Bid date, appointed date, concession length and resurfacing years are all honoured; validation rejects only what V16
  cannot represent (e.g. more than 36 manual phasing months for a longer build falls back to equated with a warning).
- **Off-sample inconsistencies.** If a V16 quirk produces an inconsistent result at some input (BS gap, negative cash),
  the engine reproduces the number and Health flags it as an error. Health never hides a V16 result.
- **Saved projects** recompute with the new engine on load; a one-time notice says "Numbers now follow the original
  workbook's method", with a link to the method notes.
- **Excel COM tolerance.** If V16's own iteration residual at an input set exceeds the §2 tolerance, that set's
  tolerance becomes V16's residual × 2, recorded in the run report.

## 10. Left to the builder

Internal module split, series naming, solver details within the tolerances, UI micro-layout within the existing design
system. Anything that would change a number goes back to V16 as the authority.
