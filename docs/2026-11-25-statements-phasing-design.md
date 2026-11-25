# Milestone — Financial Statements & Phasing · Design

Date: 2026-11-25 · User request (Hindi): "Balance Sheet / Income Statement / Cash Flow Statement should show, on
separate sheets; and a Phasing sheet; add a Financial Statements section." Builds on the milestone and projects
designs (both still binding). This supersedes the original spec's non-goal "statutory statements" for a
**simplified, always-balancing** set of statements (not IGAAP/IndAS-certified — say so in the UI footnote).

## 1. Where it appears

**Site**
- New sidebar section **Phasing** (after Build): owns the existing field groups *Phasing* and *Build Milestones*
  (change their `FieldDef.section` to `'phasing'` — do **not** reorder `FIELDS`; saved blank-project data encodes
  empty fields by FIELDS order). Results: monthly construction schedule table, S-curve chart (cumulative physical
  & financial progress with milestone requirement markers), monthly funding stack chart (Support/Equity/Debt),
  tranche receipts list.
- New sidebar section **Financial Statements** (after Returns): tabs **Income Statement · Balance Sheet · Cash
  Flow** (shadcn Tabs; tab in URL `?tab=is|bs|cf`). Each tab: a wide annual table (Indian FY columns `FY27 …
  FY45`, sticky row labels, scroll inside its container), totals/subtotals in bold, a one-line check banner
  ("Balance sheet balances in every year ✓" or the first failing year and gap), CSV copy, and a small chart (IS:
  revenue vs PAT bars; BS: assets composition stacked; CF: net cash by activity).
- SectionIds: add `'phasing'` and `'statements'`; sidebar order: Overview, Deal & Timeline, Build, **Phasing**,
  Capital, Income, Operations, Returns, **Financial Statements**, Health, Scenarios. ⌘K, router, health dots
  follow automatically. Blank/incomplete projects: both sections sit behind `ResultsGate`.
- New Health checks (section `statements`): `bs-balance` (error: assets − liabilities − equity ≤ ₹0.01 Cr every
  FY end), `cf-reconcile` (error: CFS closing cash = BS cash every FY).

**Excel** (`deliverables/Milestone_HAM_Model.xlsx`): sheets **Phasing**, **Income Statement**, **Balance
Sheet**, **Cash Flow** (each its own sheet, grouped with one tab colour), same rows and definitions as below,
built with formulas from the calc sheets (annual FY columns via SUMIFS on period FY-end rows), with a balance
check row on each and the two checks added to the Health sheet.

## 2. Engine (`src/engine/statements.ts`, pure, tested)

`buildStatements(r: ModelResult): Statements` and `buildPhasing(r: ModelResult): PhasingRow[]`. Years = every
Indian FY end (`fyEnd`) from the FY containing the first build month to the FY containing the last payment.
Build months bucket by month day; operation periods by payment day. Amounts in ₹ Cr.

**Definitions (simplified project accounting; these guarantee the balance sheet balances):**

Let, per build month: `uses_net` by line (from `build.uses`/month detail), `gstPaid`, `support` (net of GST),
`supportGst`, `equityDraw`, `debtDraw`, cash carry. Let `R` = reserve and `WC` = working capital (uses funded in
the last build month), `C` = capitalised project cost = totalUses − support − supportGst − netGstCredit − R − WC
(identical to the operations amortisation base).

*Income Statement (per FY)*
- Revenue = Completion Payments + Interest on Outstanding Balance + O&M payments (operations only; nothing during
  build — costs are capitalised, incl. Interest During Build).
- Operating expenses = opex. **EBITDA** = Revenue − opex.
- Amortisation of project asset = engine amortisation (C / number of operating periods, per period).
- **EBIT** = EBITDA − amortisation. Finance cost = senior-debt interest (operations). **PBT** = EBIT − finance cost.
- Tax = engine tax (current tax only; no deferred tax — footnote). **PAT** = PBT − tax.

*Balance Sheet (at each FY end)*
- Assets: **Capital work-in-progress** (during build) = cumulative uses_net excluding R and WC − cumulative
  support; **Project asset (net)** (from completion) = C − accumulated amortisation; **GST credit receivable** =
  cumulative gstPaid − cumulative supportGst − cumulative gstRecovery (may be negative → show as payable under
  liabilities if < 0); **Debt Service Reserve** (restricted cash) = reserve balance; **Working capital buffer**
  (restricted cash) = WC until released; **Cash** = build cash carry (operations: 0, all surplus distributed).
- Liabilities: **Senior debt** = closing balance.
- Equity: **Share capital** and **Promoter sub-debt** (split of cumulative equity draws by shareCapitalPct);
  **Retained earnings** = cumulative PAT − cumulative distributions (may be negative: distributions of
  Completion-Payment cash exceed accounting profit early — footnote).
- Check: total assets − (liabilities + equity) = 0 within ₹0.01 Cr every year.

*Cash Flow Statement (per FY, direct method)*
- Operating: receipts (Completion Payments + interest income + O&M + GST recovery) − opex − tax.
- Investing: construction costs paid (all build uses incl. GST and capitalised IDC, excluding R and WC) +
  Construction Support received (incl. GST) − transfers into restricted accounts (reserve funding & movements,
  WC funding) + WC release.
- Financing: equity drawn + debt drawn − principal repaid − interest paid (operations) − distributions to equity
  (distributions = engine `equityCash`, which already includes the WC release at the end).
- Net change in cash; opening cash; closing cash = BS cash (check). In operations every period nets to zero:
  (receipts − opex − tax) + (WC release − reserve movement) − (principal + interest + equityCash) = 0.
Write the code so these identities hold by construction and are asserted in tests: Σ sources = Σ uses in build;
BS balances every FY; CFS closing cash = BS cash every FY; retained earnings = Σ PAT − Σ distributions.

`PhasingRow` per build month: month end, days in month, EPC this month (fixed & variable), other uses, GST, IDC,
total cost, cumulative cost, physical % (period & cumulative), financial % cumulative, support received,
equity drawn, debt drawn, closing debt, cash carry, milestone flag (M1–M4 when the month contains a milestone
day) with required physical/financial %.

## 3. Tests that must exist
Statements balance every FY at defaults and after edits (bid 2400, equity 30%, build days 1460, sCurve phasing);
CFS reconciles; IS totals equal Σ ops values (revenue, opex, tax, interest); BS debt equals ops debtClosing at
FY ends; phasing rows sum to build totals and cumulative physical ends at 100%; sections gated in blank projects;
new Health checks fail when a statement is corrupted.
