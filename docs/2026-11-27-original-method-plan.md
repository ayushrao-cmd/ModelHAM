# Original-method Engine, IGAAP/IndAS Statements & Drill-down — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the site's engine with a faithful port of the V16 workbook so every statement cell, KPI and
construction draw matches V16 (at the sample and off it), add IGAAP and IndAS statements with drill-down, and regenerate
the live-formula Excel twin to the same method.

**Architecture:** A new engine is built beside the old one in `src/engine/v16/`, module by module, each pinned to
golden values extracted from V16 (cached values at the sample, plus Excel-COM runs at six other input sets). When the
engine and both statement sets pass, the app switches to it (`runModel` → v16), the old engine modules are deleted, the
UI is re-pointed, and the Excel twin generator is rewritten to the new method and re-verified.

**Tech Stack:** TypeScript (pure engine), React + Vite + Vitest (site), Python 3 + openpyxl + pywin32/Excel COM
(golden extraction, differential harness, Excel twin).

**Spec:** `docs/2026-11-27-original-method-design.md` (binding). Recon, cell by cell, with every value to match:
`../docs/recon/A-construction.md`, `../docs/recon/B-operations.md`, `../docs/recon/C-statements.md` (outside the repo;
gap ids A-G#, B-G#, C-# and quirk ids A-Q#, B-Q# below refer to them). V16 workbook:
`../20260707_V16_HAM Bid FM_Flexible and Rigid pavement_1095 Days (6)_1129.xlsx`. Formula dumps:
`../docs/recon/dump/*.txt`.

## Global Constraints

- Commits: identity `Mrigankar Sonowal <53226534+Mrigankar1134@users.noreply.github.com>`; **no** `Co-Authored-By`
  or "Generated with" lines (user CLAUDE.md overrides any attribution reminder).
- V16 is the authority for every number. Reproduce every quirk that changes a number at V16's inputs; generalise
  hard-codes so other inputs behave as the formula intends (design §5, §9). Never silently fix a quirk.
- Tolerances vs golden: statement cells and ledgers ₹0.01 Cr per FY cell; monthly construction draws ₹0.001 Cr; IRRs
  1e-6 (absolute, as a fraction); DSCRs 1e-4. Differential sets: same, or 2 × V16's own residual where recorded.
- `FIELDS` order is append-only (blank-project saves encode empty fields by index); new **blank-class** fields need
  the persist version bump + migration noted in `src/state/projects.ts`.
- Engine stays pure: no React/DOM imports under `src/engine/`.
- One engine run ≤ 50 ms at the sample (Solve ≤ 40 runs < 2 s).
- No client or contractor name in code, UI or docs; keep the user's email private.
- Golden JSON under `src/engine/v16/golden/` may hold V16's numbers (they are the demo sample); scripts read V16's path
  from an argument or `V16_PATH` env var, never hard-code it.
- Excel twin: live formulas, iterative calc for the loops, no VBA; `verify_excel.py` must pass at ₹0.01 Cr.

## Review Focus

- **Leap financial years** (FY28, FY32, FY36, FY40, FY44): FY split factors 0.999903/1.000097 and 365/366 interest day
  counts (B-Q11, B-G10). Test: golden FY32 and FY36 values in every ledger match (Task 4, 9).
- **Build days that move COD into another FY** (differential set `build1460`): MMR set-aside years, DSR window, FY
  columns and IGAAP first-year cell must move with it (generalised hard-codes). Test: Task 16 set `build1460` passes.
- **Grant threshold on float cumulative progress** (A-Q10): crossing compared with ε = 1e-9. Test: Task 5 asserts
  tranche 9 (80%) lands in month index 24 when cum = 0.8000000000000004.
- **Fixed points that fail to converge** (outer debt/equity/PSBG/post-COD loop; FFE-tax↔interest loop) at extreme
  inputs: capped iterations, `converged: false` surfaces as a Health error, never an infinite loop. Test: Task 13 with
  bid 1,200 returns within 200 ms and `converged` defined.
- **Blank projects**: the new engine must not run while any field is empty, and new policy/standard fields arrive
  pre-filled. Test: Task 17 store test — a fresh blank project has `active === null` and the new fields set.

---

## File Structure

```
src/engine/v16/
  types.ts        Grid, Period, Series, V16Result, Row, Statement, StatementSet, MethodNote
  grid.ts         dates (appointed, construction end, COD, annuities, concession end), monthly + post-COD periods, FY grid, factors
  indices.ts      PIM series, per-head inflation indices (FY-end), grant/O&M index functions
  construction.ts uses lines, EPC phasing, grant, STL/mob-advance, draws, IDC inner solve, PSBG release, CP GST, outer fixed point
  revenue.ts      completion base, instalments, interest, O&M payments, bonus, GST on revenue
  opex.ts         per-head costs by FY incl. GST on costs
  debt.ts         senior debt in operations (monthly), COD→1st-annuity tranche
  funds.ts        DSR (2 ledgers), Funds for Expenses (3 ledgers), MMR, interest on funds
  gst.ts          GST input/output ledgers, credit use, payment to government
  tax.ts          book (revenue-based) and tax (SLM) depreciation, losses, tax, CSR
  cash.ts         cash account, equity flows, DSCR, IRRs (annual + half-yearly XIRR + mob-adjusted)
  model.ts        runV16(inputs): V16Result — orchestration and cross-module fixed points
  notes.ts        method notes (reproduced quirks with consistent alternatives)
  statements/row.ts     Row helpers (line, subtotal, children, totals)
  statements/igaap.ts   buildIgaap(r): StatementSet
  statements/indas.ts   buildIndas(r): StatementSet (incl. financial asset)
  golden/sample.json, golden/<set>.json, golden.ts (loader + expect helpers)
scripts/v16/
  extract_golden.py     V16 cached values → golden/sample.json
  run_differential.py   Excel COM: patch inputs on a V16 copy, recalc, write golden/<set>.json
  io_map.json           V16 input cells for every Inputs path used by the sets
```
Old modules (`build.ts`, `operations.ts`, `statements.ts`, `timeline.ts`, old `model.ts` body) are deleted in Task 17.

## Shared interfaces (later tasks rely on these names)

```ts
// v16/types.ts
export type Day = number                                   // existing engine day number (dates.ts)
export interface Period { start: Day; end: Day; days: number; kind: 'construction' | 'postCod' }
export interface Grid {
  appointed: Day; constructionEnd: Day; cod: Day; firstAnnuity: Day; concessionEnd: Day
  periods: Period[]            // 37 construction + 7 post-COD at the sample
  annuities: Day[]             // 30; last = concessionEnd (B-Q14)
  fys: Day[]                   // FY ends, FY27..FY45 at the sample
  opFactorCod: number[]; opFactorAnnuity: number[]; constructionFactor: number[]   // per FY
}
export interface Row { id: string; label: string; values: number[]; total: number
  kind: 'header' | 'line' | 'subtotal' | 'total' | 'check'; children?: Row[]; formula?: string; source?: string }
export interface Statement { key: 'pl' | 'bs' | 'cf' | 'dscr' | 'irr'; title: string; rows: Row[] }
export interface StatementSet { standard: 'igaap' | 'indas'; years: Day[]; statements: Statement[]
  checks: { bs: number[]; cash: number[] } }
export interface MethodNote { id: string; text: string; v16Value?: number; consistentValue?: number }
export interface V16Kpis { projectIrrPre: number | null; projectIrrPost: number | null; equityIrr: number | null
  equityIrrPre: number | null; equityIrrAnnualPost: number | null; equityIrrAnnualPre: number | null
  equityIrrMobAdj: number | null; dscrMin: number | null; dscrAvg: number | null; dscrMax: number | null
  totalProjectCost: number; grant: number; debt: number; equity: number; leverage: number
  completionBase: number; omMargin: number }
export interface V16Result { inputs: Inputs; grid: Grid; construction: ConstructionResult; revenue: RevenueResult
  opex: OpexResult; debt: DebtResult; funds: FundsResult; gst: GstResult; tax: TaxResult; cash: CashResult
  kpis: V16Kpis; notes: MethodNote[]; converged: boolean; iterations: number }
```
Each module exports `run<Module>(…)` returning its `<Module>Result` of named series (per period, per annuity or per
FY, documented in the module) — names follow C-statements §9 ("Engine must supply" column), e.g.
`construction.months[k].{epcFixed, epcVariable, stlDraw, stlRepay, stlInterest, idc, equityShareCapital, equityUsl,
debtDraw, grant, grantGst, gstInput}`, `funds.{dsrInterest, dsrPrincipal, ffeInterest, ffeOm, ffeTax, mmr}.{opening,
funded, setAside, used, closing, interest}` per FY.

Golden format (`golden/<set>.json`): `{ meta: { set, inputs: Record<path, value>, extracted, v16Residual? },
cells: Record<"Sheet!row", { label: string; total: number | null; values: (number | null)[] }>, cols:
Record<sheet, string[]> /* ISO date per value column */, kpis: Record<string, number> }`. Helpers in `golden.ts`:
`row(set, 'Fin-IGAAP!8')`, `expectSeries(actual: number[], goldenRow, tol)`, `expectClose(a, b, tol)`.

---

### Task 1: Golden extraction (sample)

**Files:** Create `scripts/v16/extract_golden.py`, `src/engine/v16/golden/sample.json`, `src/engine/v16/golden.ts`,
`src/engine/v16/golden.test.ts`.
**Interfaces:** Produces the golden format above and `golden.ts` helpers.

- [ ] Step 1: Test `golden.test.ts`: `row('sample','Fin-IGAAP!36').total` ≈ 793.2194509898166 (1e-9);
  `row('sample','Fin-INDAS!49').total` ≈ 788.706066821826; `row('sample','Fin-IGAAP!63').values.every(v => Math.abs(v) < 1e-6)`;
  `kpis.equityIrrHalfYearly` ≈ 0.15091964602470398; `cols['Fin-IGAAP'][0] === '2027-03-31'`.
- [ ] Step 2: Run `npx vitest run src/engine/v16/golden.test.ts` → FAIL (no file).
- [ ] Step 3: `extract_golden.py <v16.xlsx> <out.json>`: two openpyxl loads; export every non-empty row of `Fin-IGAAP`,
  `Fin-INDAS` (FY columns E..W, total D), `COP-MOF` (period columns H..BO, total G, date row 11), `Revenue`, `Debt`,
  `O&M Cost`, `Inflation`, `DB` rows used by recon (dates row 12, PIM rows 83–89, MMR 91–95), and the KPI cells named in
  B-operations §9.3/§10 and C-statements §2.4–2.5/§3.4. Keys `Sheet!row`. `golden.ts` imports JSON statically.
- [ ] Step 4: Run test → PASS. Step 5: commit `test(v16): golden values extracted from the original workbook`.

### Task 2: Differential harness (Excel COM)

**Files:** Create `scripts/v16/run_differential.py`, `scripts/v16/io_map.json`, `src/engine/v16/golden/{bid2400,epc105,build1460,equity30,rates50bp,scurve}.json`.
**Interfaces:** Consumes the golden format; produces goldens for the six sets with `meta.inputs` as `Inputs` paths.

- [ ] Step 1: `io_map.json` maps each varied `Inputs` path to its V16 input cell(s) on `'1. IO '`/`CA Set`/`Fin Set`
  (bid `'1. IO '!B6`, build days `'CA Set'!N8`, EPC, equity %, build/operate rates, phasing selector), found from the
  dumps; document each in the file.
- [ ] Step 2: `run_differential.py <v16.xlsx> <set>`: copy V16 to a temp dir, open in Excel (visible=False,
  iteration on, 1000 iterations, max change 1e-9), set the set's inputs, `CalculateFull` until two passes agree to 1e-9
  (record the residual in `meta.v16Residual`), then extract with the Task 1 exporter (import it, read values via COM).
  Apply and record any hard-code patch the set needs (design §9; e.g. MMR % columns for `build1460`).
- [ ] Step 3: Run all six sets; a smoke test in `golden.test.ts`: each file loads, its `Fin-IGAAP!63` (BS check) is
  ≈ 0 every FY, and `bid2400` equity IRR > sample equity IRR.
- [ ] Step 4: Commit `test(v16): differential goldens from the original at six input sets`.

### Task 3: Inputs, defaults, fields

**Files:** Modify `src/engine/types.ts`, `src/engine/defaults.ts`, `src/fields.ts`, `src/fields.test.ts`,
`src/state/projects.ts`, `src/state/store.ts` (persist version), tests in `src/state/store.test.ts`.
**Interfaces:** Produces new `Inputs` paths used by every later task:
`stl: { pctOfBid: 0.10; option: 'STL'; repayShare: 0.125; repayMilestones: 8 }`,
`funds: { fdRate: 0.055; ffeDays: 180; mmrShare: 0.2; mmrYears: 5; dsrInterestMonths: 6; dsrPrincipalInstalments: 1 }`,
`csr: { on: true; rate: 0.02; netWorth: 500; turnover: 1000; profit: 5 }`, `tax.depLifeYears: 15`,
`build.phasing: 'manual' | 'equated' | 'sCurve'`, `build.manualPhasing: number[]` (36 values, A §2a),
`build.spvManpower: 1.5`, `build.preBid: 0.290409`, `indexation.pim: 0.04`.

- [ ] Step 1: Tests: `fields.test.ts` pinned id list = old list + the new ids appended in this order:
  `stl.pctOfBid, funds.fdRate, funds.ffeDays, funds.mmrShare, funds.mmrYears, funds.dsrInterestMonths, csr.on, csr.rate,
  tax.depLifeYears, build.manualPhasing, build.spvManpower, indexation.pim`; every `Inputs` leaf has one field;
  store test: v2 cookie with a blank project migrates to v3 and keeps its empty paths; a new blank project has
  `build.manualPhasing` and `build.spvManpower` empty and the policy fields pre-filled.
- [ ] Step 2: Run → FAIL. Step 3: implement (V16 sample defaults from A §2/§2a and B §3–§7; classes per design §6;
  `phasing` select gains `manual` = default). Bump persist to v3; migration remaps blank empty-index ranges for the
  inserted blank-class fields. Step 4: `npx vitest run` → PASS (old engine still compiles; it ignores new inputs).
- [ ] Step 5: Commit `feat(inputs): V16 inputs — STL, funds, CSR, tax life, manual phasing, PIM`.

### Task 4: Grid and indices

**Files:** Create `src/engine/v16/types.ts`, `grid.ts`, `indices.ts`, `grid.test.ts`.
**Interfaces:** `buildGrid(i: Inputs): Grid`; `pim(i, g): { atFyEnd: number[]; at(day: Day): number; grantAt(day): number }`;
`inflationIndex(i, g, rate: number): number[]` (per FY, FY-end value, B §3.2).

- [ ] Step 1: Tests vs `golden/sample.json`: appointed 2027-03-20; construction end 2030-03-18; COD 2030-03-19; first
  annuity 2030-09-15; annuity 30 = 2045-03-18; 37 construction + 7 post-COD periods, last post-COD `days === 14` (A-Q2);
  FY ends FY27..FY45; `opFactorAnnuity` FY31 ≈ 0.5397260273972603, `opFactorCod` FY30 ≈ 0.03561643835616438;
  FY-split factors incl. 0.9999026873268958 / 1.0000973126731043; inflation indices match `Inflation` golden rows
  (maintenance 4.5%, staff 7%, electricity 3%) to 1e-9.
- [ ] Step 2: Run → FAIL. Step 3: implement per A §1, B §1, B §3.2. Step 4: PASS. Step 5: commit `feat(v16): grid and indices`.

### Task 5: Construction uses, phasing, grant, STL

**Files:** Create `src/engine/v16/construction.ts` (uses part), `construction.test.ts`.
**Interfaces:** `constructionUses(i, g, D: number, E: number, psbgRelease: Day): UseLines` (monthly per line, gross & GST);
`grantSchedule(i, g): { month: number[]; crossing: Day[]; amount: number[]; gst: number[] }`;
`stlSchedule(i, g, grant): { draw, repay, balance, interest }` per period.

- [ ] Step 1: Tests vs COP-MOF golden rows 15–45 (each use line per month, ₹0.001) at the converged D, E taken from
  golden; grant total 970.638904, GST 174.715003, EPC variable net 70.638904; tranche 9 at month index 24 (Review Focus);
  STL draws 112.5 at AD+30 and AD+90 months (A-Q4), repaid 28.125 at milestones 1–8, interest total 18.353874 offset by
  "interest on MA from EPC" (net 0); PSBG commission 1.801664 gross with the +1-day quirk (A-Q3); admin 45.515973.
- [ ] Step 2: FAIL. Step 3: implement A §2–§4, gaps A-G3…G11, G14, quirks A-Q1, Q3, Q4, Q6, Q8, Q10. Step 4: PASS.
- [ ] Step 5: Commit `feat(v16): construction uses, grant and STL`.

### Task 6: Construction funding and fixed point

**Files:** Modify `construction.ts`; extend `construction.test.ts`.
**Interfaces:** `runConstruction(i, g, ops: { interestDsr: number; postCodOpex: number[] }): ConstructionResult`
(`months[]` per period with draws, IDC, equity split, balances; totals `tpc`, `debt`, `equity`, `idc`,
`fundsRequired`, `psbgRelease`, `converged`, `iterations`).

- [ ] Step 1: Tests vs golden: monthly debt/equity/share-capital/USL draws (₹0.001); totals TPC 2465.686875, funds
  required after grant 1320.332969, equity 330.083242, debt 990.249726, IDC 117.988926, post-COD interest 46.608270,
  share capital 82.52081054048645 then USL 247.56243162145938; `converged` true with ≤ 50 outer iterations.
  Supply `ops` from golden for now (Fin-IGAAP D331/D347 and post-COD O&M 8.794704) so this task stands alone.
- [ ] Step 2: FAIL. Step 3: implement A §5, gaps A-G2, G12, G13, G15–G20, quirks A-Q5, Q7, Q9. Step 4: PASS.
- [ ] Step 5: Commit `feat(v16): construction funding, IDC and fixed point`.

### Task 7: Revenue

**Files:** Create `revenue.ts`, `revenue.test.ts`.
**Interfaces:** `runRevenue(i, g, c: ConstructionResult): RevenueResult` — per annuity `instalment, interest, om,
bonus, gstInstalment, gstInterest, gstOm`; `completionBase`; FY sums via `toFy(series, dates, g)`.

- [ ] Step 1: Tests: completion base 1480.7145205479455; FY sums equal Fin-IGAAP rows 8, 9, 10 (all FYs, ₹0.01), totals
  1480.7145205479455 / 1281.406377767277 / 366.0214524353887; GST rows 378–380 by FY.
- [ ] Step 2: FAIL. Step 3: implement B §2, B-G3…G6, quirks B-Q13, B-Q14. Step 4: PASS. Step 5: commit `feat(v16): revenue`.

### Task 8: Operating costs

**Files:** Create `opex.ts`, `opex.test.ts`.
**Interfaces:** `runOpex(i, g, c): OpexResult` — per FY `ieFee, spvManpower, spvOverhead, financeLegal, insurance,
routineMaintenance, majorMaintenance, electricity, total`, GST per head, daily rate for post-COD funding.

- [ ] Step 1: Tests: each head equals Fin-IGAAP rows 15–22 every FY (₹0.01); total −386.37770064097117; GST on costs
  equals rows 366–369; post-COD O&M incl. GST 8.794704.
- [ ] Step 2: FAIL. Step 3: implement B §3, B-G7, G8, quirks B-Q9, Q10, Q11. Step 4: PASS. Step 5: commit `feat(v16): operating costs`.

### Task 9: Senior debt in operations

**Files:** Create `debt.ts`, `debt.test.ts`.
**Interfaces:** `runDebt(i, g, c): DebtResult` — monthly balances, per FY `interest, repayment, closing`; per annuity
service.

- [ ] Step 1: Tests: Fin-IGAAP rows 217–222 every FY (interest total 692.2504353809427, repayment 990.2497264858371);
  closing debt FY30 951.6363501341834, FY31 960.5422346912624; leap-FY interest (FY32, FY36) to ₹0.01.
- [ ] Step 2: FAIL. Step 3: implement B §8, B-G10, quirk B-Q15. Step 4: PASS. Step 5: commit `feat(v16): senior debt in operations`.

### Task 10: Funds (DSR, Funds for Expenses, MMR) and interest on funds

**Files:** Create `funds.ts`, `funds.test.ts`.
**Interfaces:** `runFunds(i, g, c, rev, opex, debt, taxByFy: number[]): FundsResult` (ledgers per FY as in Shared
interfaces; `interestOnFunds` per FY and by fund).

- [ ] Step 1: Tests vs Fin-IGAAP rows 282–354: every ledger row every FY; interest on funds total 81.69966022689292
  (FFE 27.608339, MMR 10.616840, DSR-interest 16.502020, DSR-principal 26.972461); DSR funded at COD 59.93073865502854;
  FFE funded 55.40297435405625; MMR set-aside 8.530097 (FY32–FY35 pattern) and 11.108406.
  Use golden tax (row 35) as `taxByFy` here.
- [ ] Step 2: FAIL. Step 3: implement B §4, B-G11…G14, quirks B-Q2, B-Q3, B-Q4, B-Q8 (generalised: 5 FYs ending with
  the 2nd FY of each MM cycle, 20% each — identical at the sample). Step 4: PASS. Step 5: commit `feat(v16): funds and interest on funds`.

### Task 11: GST ledgers

**Files:** Create `gst.ts`, `gst.test.ts`.
**Interfaces:** `runGst(i, g, c, rev, opex): GstResult` — per FY `inputCp, inputOps{om, rm, mm, electricity},
outputGrant, outputInstalment, outputInterest, outputOm, creditUsedCp, creditUsedOps, paidToGovt, creditClosing, writeOff`.

- [ ] Step 1: Tests vs Fin-IGAAP rows 362–385 every FY; paid to government total 350.2489958224803; credit closing FY30
  157.76656468891025.
- [ ] Step 2: FAIL. Step 3: implement B §5, B-G9, A-G19. Step 4: PASS. Step 5: commit `feat(v16): GST ledgers`.

### Task 12: Tax, depreciation, CSR

**Files:** Create `tax.ts`, `tax.test.ts`.
**Interfaces:** `bookDepreciation(c, rev, g)`, `taxDepreciation(c, g, i)`, `runTax(i, g, pbtBeforeCsr: number[], bookDep, taxDep): TaxResult`
(`taxable, lossesBf, tax`), `csr(i, g, pbt: number[], netWorth: number[], turnover: number[], pat: number[]): number[]`.

- [ ] Step 1: Tests: intangible additions total 1047.307348908053; book depreciation rows 238–241 every FY (FY31
  69.33940929933236, FY36 91.02138615845504); tax depreciation rows 247–250; tax row 268 total 272.79759448017876;
  losses rows 270–273; IGAAP CSR 17.889480588730393 (rows 398–407); IndAS CSR 22.402864782136117 from IndAS PBT
  (golden row Fin-INDAS!394) with quirk B-Q12.
- [ ] Step 2: FAIL. Step 3: implement B §6, §7, B-G15…G17, quirk B-Q7. Step 4: PASS. Step 5: commit `feat(v16): tax, depreciation and CSR`.

### Task 13: Cash, KPIs, orchestration

**Files:** Create `cash.ts`, `model.ts`, `notes.ts`, `model.test.ts`.
**Interfaces:** `runV16(i: Inputs): V16Result`; `cash.{closing, equityFlows (dated), dscr[], cfads[], projectFlows}`.

- [ ] Step 1: Tests vs golden, with **no golden inputs fed in** (full chain): cash in bank FY45 1123.3026931195573;
  KPIs project IRR 0.11756865643843484 / 0.10429227047105294, equity IRR half-yearly 0.15091964602470398 and pre-tax
  0.18318542838096616, annual equity 0.15479997797143308 / 0.18806922538694915, mob-adjusted 0.16736456751823428;
  DSCR avg 1.4667248362973662, min 1.1966405451878497, max 1.820775755243809; `notes` contains the DSCR note with
  consistent value ≈ 1.4250 (B-Q5); `converged` true; run time at sample < 50 ms (median of 5); bid 1,200 returns
  within 200 ms.
- [ ] Step 2: FAIL. Step 3: implement B §9, B-G18…G20, quirks B-Q1, B-Q5, B-Q6; `model.ts` orchestrates construction ↔
  ops (DSR interest, post-COD O&M) and FFE-tax ↔ interest-on-funds ↔ tax as fixed points (cap 50 each).
  Step 4: PASS. Step 5: commit `feat(v16): cash, KPIs and orchestration`.

### Task 14: IGAAP statements with drill-down

**Files:** Create `statements/row.ts`, `statements/igaap.ts`, `statements/igaap.test.ts`.
**Interfaces:** `buildIgaap(r: V16Result): StatementSet` — row ids are V16's numbering (`A.1`, `B.3`, …) prefixed by
statement key; children per C-statements §8.

- [ ] Step 1: Tests: for every row in C-statements §2.1–§2.5 the FY values and total equal golden `Fin-IGAAP!<row>`
  (₹0.01; ratios 1e-4; IRRs 1e-6); BS check and cash check rows zero every FY; every row with children has
  `Σ children.values === values` per FY (where the tree is additive) and depth ≤ 3; labels match V16's text.
- [ ] Step 2: FAIL. Step 3: implement C §2, §4, §6.1, §8. Step 4: PASS. Step 5: commit `feat(v16): IGAAP statements with drill-down`.

### Task 15: IndAS statements with financial asset

**Files:** Create `statements/indas.ts`, `statements/indas.test.ts`.
**Interfaces:** `buildIndas(r: V16Result): StatementSet`; `financialAsset(r): { rate, opening, addition, grant, receipt, financeIncome, closing }`.

- [ ] Step 1: Tests: every row of C-statements §3.1–§3.4 equals golden `Fin-INDAS!<row>`; FA rate ≈ 0.059613627963622795;
  FA closing FY45 ≈ 0 (1e-6); finance income total 630.71 (golden); PAT 788.706066821826; BS check zero every FY.
- [ ] Step 2: FAIL. Step 3: implement C §3, §5, §6.2. Step 4: PASS. Step 5: commit `feat(v16): IndAS statements and financial asset`.

### Task 16: Differential suite

**Files:** Create `src/engine/v16/differential.test.ts`.
- [ ] Step 1: For each of the six goldens: set `DEFAULT_INPUTS` + `meta.inputs`, run `runV16`, compare KPIs, every
  Fin-IGAAP and Fin-INDAS statement row, COP-MOF monthly draws (tolerances per Global Constraints or 2 × residual).
- [ ] Step 2: Run; fix engine discrepancies in the owning module (each fix with a unit test in that module's file).
- [ ] Step 3: All PASS. Commit `test(v16): engine matches the original at six input sets`.

### Task 17: Switch the app to the v16 engine

**Files:** Modify `src/engine/model.ts` (re-export `runV16` as `runModel`, `ModelResult = V16Result`), `health.ts`,
`solve.ts`, `sensitivity.ts`, `src/state/useModel.ts`, all section components consuming old fields (19 files use
`useModel/useResult`); delete `build.ts`, `operations.ts`, `statements.ts`, `timeline.ts` and their tests.
- [ ] Step 1: Tests: health — V16 checks (BS, cash ≥ 0, cash tie, equity tie, debt tie) exist and pass at sample; the two
  sample warnings still fail (milestone funding 2, O&M margin with its new amount); a "Method notes" group lists every
  reproduced quirk; `solveBidPrice(D, 0.1509196…)` recovers 2,250 ± 1; store test from Task 3 passes; tsc clean.
- [ ] Step 2: FAIL. Step 3: implement; re-point every consumer (`tsc` lists them). Step 4: `npx vitest run` and
  `npx tsc --noEmit` PASS; `npm run build` succeeds. Step 5: commit `feat: site runs on the original-method engine`.

### Task 18: Statements UI (IGAAP | IndAS, drill-down)

**Files:** Modify `src/sections/Statements*.tsx`; create `src/components/StatementTable.tsx` (+ test).
- [ ] Step 1: Tests (Testing Library): `?std=indas` shows IndAS P&L with "Notional Income as per IndAS"; tabs P&L, Balance
  Sheet, Cash Flow, DSCR, IRR; clicking a chevron row (or Enter/Space on it) reveals its children with amounts and sets
  `aria-expanded`; side panel shows the row's formula text; CSV copy includes child rows with depth indent; check banner
  says balances for both standards at sample.
- [ ] Step 2: FAIL. Step 3: implement per design §6 with the existing design system; sticky label column, FY columns
  FY27…FY45 + Total, V16 numbering. Step 4: PASS. Step 5: commit `feat(ui): IGAAP and IndAS statements with drill-down`.

### Task 19: Other screens, inputs UI, notice — push

**Files:** Modify Overview, Returns, Capital, Build, Phasing, Income, Operations sections; `ProjectSwitcher`/app shell
for the one-time notice; field editors for `manualPhasing` (list) and new fields.
- [ ] Step 1: Tests: Overview tiles show 15.09% equity IRR, 11.76% / 10.43% project IRR, DSCR min 1.20× avg 1.47×;
  Returns lists all V16 IRR variants; DSCR chart annual FY31–FY43; Capital shows STL card and DSR/FFE/MMR; one-time
  notice appears once per browser (cookie flag) and links to method notes.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: full suite + build PASS; screenshot check with the `run` skill at 1440 and
  390 px. Step 5: commit `feat(ui): screens follow the original method`; push to `main`.

### Task 20: Excel twin — construction sheets (live formulas)

**Files:** Modify `../deliverables/_build/build_excel.py`, `engine_dump.ts`, `verify_excel.py`.
- [ ] Step 1: `verify_excel.py` gains comparisons for Calc_Build monthly draws, TPC, debt, equity, IDC vs `engine_dump`.
- [ ] Step 2: Run → FAIL. Step 3: rewrite Calc_Build/Build/Phasing/Capital to the v16 construction method (post-COD
  columns, STL ledger, IDC average balance with iterative calc, V16 draw rule, PSBG release). Step 4: verify PASS (0 errors).
- [ ] Step 5: Commit in the deliverables tree is not a git repo — record in `excel-report.md`.

### Task 21: Excel twin — operations sheets

- [ ] Same pattern: Calc_Ops, Income, Operations, Returns to v16 (FY layer, funds, GST, tax, CSR, cash, DSCR, IRR
  variants); `verify_excel.py` compares every operations ledger and KPI; PASS.

### Task 22: Excel twin — IGAAP and IndAS statement sheets

- [ ] Sheets `IGAAP P&L`, `IGAAP Balance Sheet`, `IGAAP Cash Flow`, `IndAS P&L`, `IndAS Balance Sheet`, `IndAS Cash Flow`
  (replacing the three simplified sheets), V16 numbering, grouped outline rows for drill-down (Excel row grouping);
  Health sheet gains V16 checks; `verify_excel.py` compares every statement row for both standards at ₹0.01 and runs
  the six differential sets through the twin. PASS, screenshots refreshed.

### Task 23: Guide refresh

**Files:** `../deliverables/_guide/guide.src.html`, `figures.py`, shoot scripts.
- [ ] Update every number from `engine_kpis.json`, rewrite the statements chapter (IGAAP vs IndAS, drill-down, method
  notes), reshoot site and Excel images, rebuild the PDF, page-by-page visual check; send the PDF and Excel to the user.
