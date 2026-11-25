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
  soft('build.financeLegal', 'Finance & Legal (Build)', 'money', 'Lump-sum finance and legal cost during build, ₹ Cr.', { min: 0, step: 0.1 }),
  hard('build.contingency', 'Contingency', 'money', 'Lump-sum contingency in ₹ Cr.', { min: 0, step: 0.5 }),
  soft('build.preBid', 'Pre-bid Expenses', 'money', 'Pre-bid expenses in ₹ Cr.', { min: 0, step: 0.01 }),
  soft('build.preBidMiscPct', 'Pre-bid Miscellaneous Allowance', 'percent', 'Miscellaneous allowance on top of pre-bid expenses (100% doubles them).', { min: 0, max: 5, step: 0.1, prefill: 'policy' }),
  soft('build.spvFormationPctOfShareCapital', 'SPV Formation (% of Share Capital)', 'percent', 'SPV formation cost as a share of share capital.', { min: 0, max: 0.05, step: 0.0005, prefill: 'policy' }),
  soft('build.patrolCapital', 'Patrol Vehicles (Capital)', 'money', 'Capital cost of patrol vehicles in ₹ Cr.', { min: 0, step: 0.01 }),
  soft('build.patrolRental', 'Patrol Vehicles (Rental)', 'money', 'Rental cost of patrol vehicles during build in ₹ Cr.', { min: 0, step: 0.01 }),
  soft('build.perfSecurityPctOfBid', 'Performance Security (% of Bid)', 'percent', 'Performance Security as a share of Bid Price.', { min: 0, max: 0.2, step: 0.005, prefill: 'standard' }),
  soft('build.perfSecurityCommissionPa', 'Performance Security Commission (p.a.)', 'percent', 'Annual bank commission on Performance Security.', { min: 0, max: 0.05, step: 0.0005, prefill: 'standard' }),
  phasing('build.phasing', 'EPC Phasing', 'select', 'How EPC spend is spread over the build period.',
    { options: [{ value: 'equated', label: 'Equated monthly' }, { value: 'sCurve', label: 'S-curve' }] }),

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

  idx('indexation.wpi', 'WPI Inflation', 'percent', 'Assumed annual wholesale price inflation.', { min: 0, max: 0.2, step: 0.005, key: true }),
  idx('indexation.cpi', 'CPI Inflation', 'percent', 'Assumed annual consumer price inflation.', { min: 0, max: 0.2, step: 0.005, key: true }),
  idx('indexation.wpiWeight', 'WPI Weight', 'percent', 'Weight of WPI in the Indexation Factor; CPI gets the rest.', { min: 0, max: 1, step: 0.05, prefill: 'standard' }),

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
]

const byId = new Map(FIELDS.map(x => [x.id, x]))
export const fieldById = (id: string): FieldDef | undefined => byId.get(id)
