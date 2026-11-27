import type { FieldDef, SectionId } from './engine/types'

type K = FieldDef['kind']
const f = (section: SectionId, group: string) =>
  (id: string, label: string, kind: K, help: string, extra: Partial<FieldDef> = {}): FieldDef =>
    ({ id, label, section, group, kind, help, ...extra })

const bid = f('deal', 'Bid')
const dates = f('deal', 'Dates')
const project = f('deal', 'Project')
const hard = f('build', 'Hard costs')
const soft = f('build', 'Soft costs')
// Phasing and Build Milestones sit in their own section; FIELDS order is unchanged (blank saves index it).
const phasing = f('phasing', 'Phasing')
const miles = f('phasing', 'Build Milestones')
const struct = f('capital', 'Structure')
const loan = f('capital', 'Loan terms')
const repay = f('capital', 'Repayment')
const compl = f('income', 'Completion Payments')
const rate = f('income', 'Annuity Rate')
const om = f('income', 'O&M Payments')
const idx = f('income', 'Indexation')
const run = f('operations', 'Running costs')
const maint = f('operations', 'Maintenance')
const ins = f('operations', 'Insurance')
const infl = f('operations', 'Inflation')
const tax = f('operations', 'Tax')
const tgt = f('returns', 'Targets')

// Hidden (`hidden: true`): inputs the original-method engine does not read. Patrol rental and build finance & legal are
// derived from build days (their rates are the fields below), the expense-fund period follows the first payment lag,
// the original has no support payment lag, and its price index is the PIM rate rather than a WPI/CPI blend.
export const FIELDS: FieldDef[] = [
  project('deal.projectName', 'Project Name', 'text', 'Display name of the project.'),
  project('deal.authorityName', 'Authority Name', 'text', 'Name of the awarding authority.'),
  bid('deal.bidPrice', 'Bid Price', 'money', 'Quoted project price in ₹ Cr, the base for payments and security.', { min: 0, step: 10, key: true }),
  bid('deal.authorityEstimate', 'Authority Estimate', 'money', "The Authority's estimated project cost in ₹ Cr; bid discount is measured against it.", { min: 0, step: 10 }),
  project('deal.lengthKm', 'Length (km)', 'number', 'Project road length in kilometres.', { min: 0, step: 0.1 }),
  dates('deal.bidDate', 'Bid Date', 'date', 'Date prices are quoted; the indexation clock starts here.'),
  dates('deal.daysToAward', 'Days to Award', 'days', 'Days from bid date to award.', { min: 0, step: 5 }),
  dates('deal.daysToAgreement', 'Days to Agreement', 'days', 'Days from award to signing the concession agreement.', { min: 0, step: 5 }),
  dates('deal.daysToStart', 'Days to Start', 'days', 'Days from agreement to the Start Date (appointed date).', { min: 0, step: 5 }),
  dates('deal.buildDays', 'Build Days', 'days', 'Construction period in days from Start Date to Completion Date, one to five years (365 to 1,825 days).', { min: 365, max: 1825, step: 30 }),
  // Fixed: the payment, repayment and O&M schedules are fixed-length lists sized for 15 years.
  dates('deal.operateYears', 'Operate Years', 'years', 'Fixed at 15 years by the concession agreement.', { min: 15, max: 15, readOnly: true, prefill: 'standard' }),
  bid('deal.pavement', 'Pavement Type', 'select', 'Sets the maintenance payment in the year before resurfacing.',
    { options: [{ value: 'flexible', label: 'Flexible' }, { value: 'flexiblePerpetual', label: 'Flexible perpetual' }] }),

  miles('milestones', 'Build Milestones', 'milestoneList', 'Day from start with required physical and financial progress at each milestone.'),
  hard('build.epcFixed', 'EPC Fixed Price', 'money', 'Fixed contractor price in ₹ Cr, excluding GST.', { min: 0, step: 10, key: true }),
  hard('build.gstWorks', 'GST on Works', 'percent', 'GST rate on construction works.', { min: 0, max: 0.3, step: 0.005, prefill: 'policy' }),
  soft('build.gstServices', 'GST on Services', 'percent', 'GST rate on service costs.', { min: 0, max: 0.3, step: 0.005, prefill: 'policy' }),
  soft('build.ieFeePctOfBid', 'Independent Engineer Fee (% of Bid)', 'percent', 'Independent Engineer fee during build as a share of Bid Price.', { min: 0, max: 0.05, step: 0.0005, prefill: 'policy' }),
  soft('build.adminPctOfEpc', 'SPV Admin (% of EPC)', 'percent', 'SPV administration cost as a share of EPC.', { min: 0, max: 0.1, step: 0.0025, prefill: 'policy' }),
  soft('build.fundRaisingPctOfDebt', 'Fund-raising Fee (% of Debt)', 'percent', 'Upfront fee on debt raised.', { min: 0, max: 0.05, step: 0.0005, prefill: 'policy' }),
  soft('build.financeLegal', 'Finance & Legal (Build)', 'money', 'Lump-sum finance and legal cost during build, ₹ Cr.', { min: 0, step: 0.1, hidden: true }),
  hard('build.contingency', 'Contingency', 'money', 'Lump-sum contingency in ₹ Cr.', { min: 0, step: 0.5 }),
  soft('build.preBid', 'Pre-bid Expenses', 'money', 'Pre-bid expenses in ₹ Cr.', { min: 0, step: 0.01 }),
  soft('build.preBidMiscPct', 'Pre-bid Miscellaneous Allowance', 'percent', 'Miscellaneous allowance on top of pre-bid expenses (100% doubles them).', { min: 0, max: 5, step: 0.1, prefill: 'policy' }),
  soft('build.spvFormationPctOfShareCapital', 'SPV Formation (% of Share Capital)', 'percent', 'SPV formation cost as a share of share capital.', { min: 0, max: 0.05, step: 0.0005, prefill: 'policy' }),
  soft('build.patrolCapital', 'Patrol Vehicles (Capital)', 'money', 'Capital cost of patrol vehicles in ₹ Cr.', { min: 0, step: 0.01 }),
  soft('build.patrolRental', 'Patrol Vehicles (Rental)', 'money', 'Rental cost of patrol vehicles during build in ₹ Cr.', { min: 0, step: 0.01, hidden: true }),
  soft('build.perfSecurityPctOfBid', 'Performance Security (% of Bid)', 'percent', 'Performance Security as a share of Bid Price.', { min: 0, max: 0.2, step: 0.005, prefill: 'standard' }),
  soft('build.perfSecurityCommissionPa', 'Performance Security Commission (p.a.)', 'percent', 'Annual bank commission on Performance Security.', { min: 0, max: 0.05, step: 0.0005, prefill: 'standard' }),
  phasing('build.phasing', 'EPC Phasing', 'select', 'How EPC spend is spread over the build period.',
    { options: [{ value: 'manual', label: 'Manual monthly %' }, { value: 'equated', label: 'Equated monthly' }, { value: 'scheduleG', label: 'Schedule G' }] }),

  struct('support.pctOfBid', 'Construction Support (% of Bid)', 'percent', 'Total Construction Support from the Authority as a share of Bid Price.', { min: 0, max: 0.6, step: 0.01, prefill: 'standard' }),
  struct('support.tranches', 'Support Tranches', 'trancheList', 'Physical progress at which each Construction Support tranche is paid, and its weight: Construction Support (% of Bid) is split across tranches in proportion to their weights.', { prefill: 'standard' }),

  struct('capital.equityPct', 'Equity Share of Funding', 'percent', 'Equity as a share of funding need; the rest is debt.', { min: 0, max: 1, step: 0.01 }),
  struct('capital.upfrontEquityPct', 'Upfront Equity', 'percent', 'Share of equity invested before debt is drawn.', { min: 0, max: 1, step: 0.05 }),
  struct('capital.shareCapitalPct', 'Share Capital (% of Equity)', 'percent', 'Share-capital portion of equity; the rest is promoter sub-debt (display split only).', { min: 0, max: 1, step: 0.05 }),
  loan('capital.buildRate', 'Loan Rate – Build', 'percent', 'Interest rate on senior debt during build.', { min: 0, max: 0.2, step: 0.0025, key: true }),
  loan('capital.operateRate', 'Loan Rate – Operate', 'percent', 'Interest rate on senior debt during operations.', { min: 0, max: 0.2, step: 0.0025, key: true }),
  repay('capital.repayment', 'Repayment Schedule', 'percentList', '25 half-yearly principal repayments as shares of debt; must total 100%.'),
  struct('capital.maxLeverage', 'Max Debt / Equity', 'number', 'Health warning above this debt-to-equity ratio.', { min: 0, step: 0.1, prefill: 'policy' }),
  loan('capital.dscrWarn', 'DSCR Warning Level', 'number', 'Health warning when minimum DSCR falls below this.', { min: 1, step: 0.05, prefill: 'policy' }),

  compl('income.completionPctOfBid', 'Completion Payments (% of Bid)', 'percent', 'Share of Bid Price paid after completion as Completion Payments.', { min: 0, max: 1, step: 0.01, prefill: 'standard' }),
  compl('income.installments', 'Completion Payment Schedule', 'percentList', '30 half-yearly installments of the Completion Payments; must total 100%.', { prefill: 'standard' }),
  compl('income.firstPaymentLagDays', 'First Payment Lag', 'days', 'Days from Completion Date to the first payment.', { min: 0, step: 5, prefill: 'standard' }),
  rate('income.bankRates', 'Reference Lending Rates', 'percentList', 'Five bank reference rates averaged for the Annuity Rate.', { key: true }),
  rate('income.spread', 'Annuity Spread', 'percent', 'Spread added to the average reference rate.', { min: 0, max: 0.05, step: 0.0005, prefill: 'standard' }),
  rate('income.rateQuoteDate', 'Rate Quote Date', 'date', 'Date the reference rates were quoted.'),
  rate('income.maxQuoteAgeMonths', 'Max Quote Age (months)', 'number', 'Health warning when rate quotes are older than this.', { min: 0, step: 1, prefill: 'policy' }),
  om('income.omBaseRate', 'O&M Payment – Base', 'percent', 'Annual O&M payment as a share of Bid Price in ordinary years.', { min: 0, max: 0.05, step: 0.0005, prefill: 'standard' }),
  om('income.omResurfacingRate', 'O&M Payment – Resurfacing Year', 'percent', 'Annual O&M payment as a share of Bid Price in a resurfacing year.', { min: 0, max: 0.1, step: 0.0005, prefill: 'standard' }),
  om('income.omPreResurfacingFlexible', 'O&M Payment – Pre-resurfacing (Flexible)', 'percent', 'O&M payment rate in the year before resurfacing, flexible pavement.', { min: 0, max: 0.05, step: 0.0005, prefill: 'standard' }),
  om('income.omPreResurfacingPerpetual', 'O&M Payment – Pre-resurfacing (Perpetual)', 'percent', 'O&M payment rate in the year before resurfacing, perpetual pavement.', { min: 0, max: 0.05, step: 0.0005, prefill: 'standard' }),

  idx('indexation.wpi', 'WPI Inflation', 'percent', 'Assumed annual wholesale price inflation.', { min: 0, max: 0.2, step: 0.005, key: true, hidden: true }),
  idx('indexation.cpi', 'CPI Inflation', 'percent', 'Assumed annual consumer price inflation.', { min: 0, max: 0.2, step: 0.005, key: true, hidden: true }),
  idx('indexation.wpiWeight', 'WPI Weight', 'percent', 'Weight of WPI in the Indexation Factor; CPI gets the rest.', { min: 0, max: 1, step: 0.05, prefill: 'standard', hidden: true }),

  run('operations.routine', 'Routine Maintenance', 'money', 'Annual routine maintenance in ₹ Cr at bid-date prices.', { min: 0, step: 0.1, key: true }),
  run('operations.electricity', 'Electricity', 'money', 'Annual electricity cost in ₹ Cr at bid-date prices.', { min: 0, step: 0.1 }),
  run('operations.financeLegal', 'Finance & Legal (Operations)', 'money', 'Annual finance and legal cost in ₹ Cr.', { min: 0, step: 0.1 }),
  run('operations.staff', 'SPV Staff', 'money', 'Annual SPV staff cost in ₹ Cr.', { min: 0, step: 0.1 }),
  run('operations.patrolRunning', 'Patrol Vehicle Running', 'money', 'Annual patrol vehicle running cost in ₹ Cr.', { min: 0, step: 0.01 }),
  run('operations.ieFee', 'Independent Engineer Fee (Operations)', 'money', 'Annual Independent Engineer fee in ₹ Cr.', { min: 0, step: 0.1 }),
  ins('operations.insuranceBaseRate', 'Insurance Base Rate', 'percent', 'Insurance premium base rate applied to EPC.', { min: 0, max: 0.01, step: 0.0001 }),
  ins('operations.insuranceLoading', 'Insurance Loading', 'number', 'Multiplier on the base rate (2.15 means 2.15x).', { min: 0, step: 0.05 }),
  maint('operations.majorMaintenance', 'Major Maintenance', 'money', 'Cost in ₹ Cr of each resurfacing, at bid-date prices.', { min: 0, step: 0.5, key: true }),
  maint('operations.resurfacingYears', 'Resurfacing Years', 'years', 'The two operating years in which resurfacing is done.'),
  infl('operations.inflation.maintenance', 'Maintenance Inflation', 'percent', 'Annual inflation on maintenance costs.', { min: 0, max: 0.2, step: 0.005 }),
  infl('operations.inflation.staff', 'Staff Inflation', 'percent', 'Annual inflation on staff costs.', { min: 0, max: 0.2, step: 0.005 }),
  infl('operations.inflation.electricity', 'Electricity Inflation', 'percent', 'Annual inflation on electricity costs.', { min: 0, max: 0.2, step: 0.005 }),
  infl('operations.inflation.insurance', 'Insurance Inflation', 'percent', 'Annual inflation on insurance costs.', { min: 0, max: 0.2, step: 0.005 }),

  tax('tax.baseRate', 'Base Tax Rate', 'percent', 'Corporate tax rate before surcharge and cess.', { min: 0, max: 0.5, step: 0.005, prefill: 'policy' }),
  tax('tax.surcharge', 'Surcharge', 'percent', 'Surcharge on tax.', { min: 0, max: 0.5, step: 0.01, prefill: 'policy' }),
  tax('tax.cess', 'Cess', 'percent', 'Health and education cess on tax and surcharge.', { min: 0, max: 0.2, step: 0.01, prefill: 'policy' }),
  tgt('targets.equityIrrHurdle', 'Equity IRR Hurdle', 'percent', 'Target equity return; used by the Solve Bid Price control and Health.', { min: 0, max: 0.5, step: 0.005, prefill: 'policy' }),
  // Appended, not inserted (FIELDS order is pinned); shown after Support Tranches via `after`.
  struct('support.lagDays', 'Support Payment Lag', 'days', 'Days from the end of the month a tranche is earned to the month it is received (engineer certification and Authority release). A receipt that would fall after completion is taken in the last build month; capped at 90 days so build funding still balances.', { min: 0, max: 90, step: 5, prefill: 'policy', after: 'support.tranches', hidden: true }),
  // V16 inputs, appended (order pinned); shown next to their related field via `after`.
  struct('stl.pctOfBid', 'Short-term loan (% of bid)', 'percent', 'Short-term loan (STL) taken in two equal instalments early in the build, passed to the EPC contractor back to back, as a share of Bid Price.', { min: 0, max: 0.3, step: 0.01, prefill: 'policy', after: 'capital.shareCapitalPct' }),
  loan('funds.fdRate', 'Interest on Funds (FD Rate)', 'percent', 'Fixed-deposit rate earned on the expense, DSR and MMR funds.', { min: 0, max: 0.2, step: 0.0025, prefill: 'policy', after: 'capital.dscrWarn' }),
  loan('funds.ffeDays', 'Funds for Expenses (days)', 'days', 'Days of operating expenses held in the Funds for Expenses account.', { min: 0, max: 365, step: 15, prefill: 'policy', after: 'funds.fdRate', hidden: true }),
  loan('funds.mmrShare', 'MMR Set-aside (share of Major Maintenance)', 'percent', 'Share of the next Major Maintenance cost set aside each year in the maintenance reserve.', { min: 0, max: 1, step: 0.05, prefill: 'policy', after: 'funds.ffeDays' }),
  loan('funds.mmrYears', 'MMR Set-aside Years', 'years', 'Number of years the maintenance reserve is built up before each Major Maintenance.', { min: 1, max: 10, step: 1, prefill: 'policy', after: 'funds.mmrShare' }),
  loan('funds.dsrInterestMonths', 'DSR Interest (months)', 'number', 'Months of interest held in the debt service reserve.', { min: 0, max: 12, step: 1, prefill: 'policy', after: 'funds.mmrYears' }),
  tax('csr.on', 'CSR Applies', 'toggle', 'Whether the company is subject to Corporate Social Responsibility spending.', { prefill: 'policy' }),
  tax('csr.rate', 'CSR Rate', 'percent', 'CSR spend as a share of average profit before tax of the last three years.', { min: 0, max: 0.1, step: 0.005, prefill: 'policy', after: 'csr.on' }),
  tax('tax.depLifeYears', 'Tax Depreciation Life (years)', 'years', 'Straight-line life for income-tax depreciation of the project cost.', { min: 1, max: 40, step: 1, prefill: 'policy', after: 'tax.cess' }),
  phasing('build.manualPhasing', 'Manual EPC Phasing', 'percentList', '36 monthly shares of EPC spend, by month number from the Start Date; must total 100%.', { after: 'build.phasing' }),
  soft('build.spvManpower', 'SPV Manpower (Build)', 'money', 'SPV manpower cost during build in ₹ Cr, spread over the build period; no GST.', { min: 0, step: 0.1, after: 'build.patrolRental' }),
  idx('indexation.pim', 'Price Index Multiple (PIM)', 'percent', 'Annual rate applied to the milestone and grant price adjustment (simple, not compounded).', { min: 0, max: 0.2, step: 0.005, prefill: 'standard', after: 'indexation.wpiWeight' }),
  soft('build.patrolRentalPerMonth', 'Patrol Rental (per month)', 'money', 'Patrol vehicle rental per month of build in ₹ Cr; the build total is this x 12 x build days / 365.', { min: 0, step: 0.001, prefill: 'policy', after: 'build.patrolRental' }),
  soft('build.flcOneOff', 'Finance & Legal (one-off)', 'money', 'One-time finance and legal costs in ₹ Cr: TEV, LLC, LIA and stamp duty.', { min: 0, step: 0.01, prefill: 'policy', after: 'build.financeLegal' }),
  soft('build.flcAnnual', 'Finance & Legal (per year)', 'money', 'Finance and legal costs in ₹ Cr charged for each 31 March falling in the build: lead lender, escrow, rating, auditor and secretarial.', { min: 0, step: 0.05, prefill: 'policy', after: 'build.flcOneOff' }),
  // Structural V16 settings the brief's id list omits; kept as fields so every Inputs leaf has one.
  struct('stl.option', 'Mobilisation Advance Type', 'select', 'Mobilisation advance is a short-term loan (the only option for now).', { options: [{ value: 'STL', label: 'Short-term loan' }], prefill: 'policy', after: 'stl.pctOfBid' }),
  struct('stl.repayShare', 'STL Repayment per Milestone', 'percent', 'Share of the short-term loan repaid at each grant milestone.', { min: 0, max: 1, step: 0.0125, prefill: 'policy', after: 'stl.option' }),
  struct('stl.repayMilestones', 'STL Repayment Milestones', 'number', 'Number of grant milestones at which the short-term loan is repaid.', { min: 1, max: 10, step: 1, prefill: 'policy', after: 'stl.repayShare' }),
  loan('funds.dsrPrincipalInstalments', 'DSR Principal (instalments)', 'number', 'Number of next principal instalments held in the debt service reserve.', { min: 0, max: 4, step: 1, prefill: 'policy', after: 'funds.dsrInterestMonths' }),
  tax('csr.netWorth', 'CSR Net Worth Threshold', 'money', 'CSR applies when the previous year net worth exceeds this, in ₹ Cr.', { min: 0, step: 10, prefill: 'policy', after: 'csr.rate' }),
  tax('csr.turnover', 'CSR Turnover Threshold', 'money', 'CSR applies when the previous year revenue exceeds this, in ₹ Cr.', { min: 0, step: 10, prefill: 'policy', after: 'csr.netWorth' }),
  tax('csr.profit', 'CSR Profit Threshold', 'money', 'CSR applies when the previous year profit after tax exceeds this, in ₹ Cr.', { min: 0, step: 1, prefill: 'policy', after: 'csr.turnover' }),
]

const byId = new Map(FIELDS.map(x => [x.id, x]))
export const fieldById = (id: string): FieldDef | undefined => byId.get(id)
