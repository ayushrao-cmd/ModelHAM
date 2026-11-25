import type { FieldDef, SectionId } from './engine/types'

type K = FieldDef['kind']
const f = (section: SectionId, group: string) =>
  (id: string, label: string, kind: K, help: string, extra: Partial<FieldDef> = {}): FieldDef =>
    ({ id, label, section, group, kind, help, ...extra })

const deal = f('deal', 'Deal')
const timeline = f('deal', 'Timeline')
const build = f('build', 'Build cost')
const sup = f('build', 'Construction Support')
const cap = f('capital', 'Funding')
const debt = f('capital', 'Senior debt')
const inc = f('income', 'Income')
const rate = f('income', 'Annuity Rate')
const idx = f('income', 'Indexation')
const ops = f('operations', 'Operating costs')
const infl = f('operations', 'Inflation')
const tax = f('returns', 'Tax')
const tgt = f('returns', 'Targets')

export const FIELDS: FieldDef[] = [
  deal('deal.projectName', 'Project Name', 'text', 'Display name of the project.'),
  deal('deal.authorityName', 'Authority Name', 'text', 'Name of the awarding authority.'),
  deal('deal.bidPrice', 'Bid Price', 'money', 'Quoted project price in ₹ Cr, the base for payments and security.', { min: 0, step: 10, key: true }),
  deal('deal.authorityEstimate', 'Authority Estimate', 'money', "The Authority's estimated project cost in ₹ Cr; bid discount is measured against it.", { min: 0, step: 10 }),
  deal('deal.lengthKm', 'Length (km)', 'number', 'Project road length in kilometres.', { min: 0, step: 0.1 }),
  deal('deal.bidDate', 'Bid Date', 'date', 'Date prices are quoted; the indexation clock starts here.'),
  timeline('deal.daysToAward', 'Days to Award', 'days', 'Days from bid date to award.', { min: 0, step: 5 }),
  timeline('deal.daysToAgreement', 'Days to Agreement', 'days', 'Days from award to signing the concession agreement.', { min: 0, step: 5 }),
  timeline('deal.daysToStart', 'Days to Start', 'days', 'Days from agreement to the Start Date (appointed date).', { min: 0, step: 5 }),
  timeline('deal.buildDays', 'Build Days', 'days', 'Construction period in days from Start Date to Completion Date.', { min: 1, step: 30 }),
  timeline('deal.operateYears', 'Operate Years', 'years', 'Operations period in years after completion.', { min: 1, max: 30, step: 1 }),
  deal('deal.pavement', 'Pavement Type', 'select', 'Sets the maintenance payment in the year before resurfacing.',
    { options: [{ value: 'flexible', label: 'Flexible' }, { value: 'flexiblePerpetual', label: 'Flexible perpetual' }] }),

  build('milestones', 'Build Milestones', 'number', 'Day from start with required physical and financial progress at each milestone.'),
  build('build.epcFixed', 'EPC Fixed Price', 'money', 'Fixed contractor price in ₹ Cr, excluding GST.', { min: 0, step: 10, key: true }),
  build('build.gstWorks', 'GST on Works', 'percent', 'GST rate on construction works.', { min: 0, max: 0.3, step: 0.005 }),
  build('build.gstServices', 'GST on Services', 'percent', 'GST rate on service costs.', { min: 0, max: 0.3, step: 0.005 }),
  build('build.ieFeePctOfBid', 'Independent Engineer Fee (% of Bid)', 'percent', 'Independent Engineer fee during build as a share of Bid Price.', { min: 0, max: 0.05, step: 0.0005 }),
  build('build.adminPctOfEpc', 'SPV Admin (% of EPC)', 'percent', 'SPV administration cost as a share of EPC.', { min: 0, max: 0.1, step: 0.0025 }),
  build('build.fundRaisingPctOfDebt', 'Fund-raising Fee (% of Debt)', 'percent', 'Upfront fee on debt raised.', { min: 0, max: 0.05, step: 0.0005 }),
  build('build.financeLegal', 'Finance & Legal (Build)', 'money', 'Lump-sum finance and legal cost during build, ₹ Cr.', { min: 0, step: 0.1 }),
  build('build.contingency', 'Contingency', 'money', 'Lump-sum contingency in ₹ Cr.', { min: 0, step: 0.5 }),
  build('build.preBid', 'Pre-bid Expenses', 'money', 'Pre-bid expenses in ₹ Cr.', { min: 0, step: 0.01 }),
  build('build.preBidMiscPct', 'Pre-bid Miscellaneous Allowance', 'percent', 'Miscellaneous allowance on top of pre-bid expenses (100% doubles them).', { min: 0, max: 5, step: 0.1 }),
  build('build.spvFormationPctOfShareCapital', 'SPV Formation (% of Share Capital)', 'percent', 'SPV formation cost as a share of share capital.', { min: 0, max: 0.05, step: 0.0005 }),
  build('build.patrolCapital', 'Patrol Vehicles (Capital)', 'money', 'Capital cost of patrol vehicles in ₹ Cr.', { min: 0, step: 0.01 }),
  build('build.patrolRental', 'Patrol Vehicles (Rental)', 'money', 'Rental cost of patrol vehicles during build in ₹ Cr.', { min: 0, step: 0.01 }),
  build('build.perfSecurityPctOfBid', 'Performance Security (% of Bid)', 'percent', 'Performance Security as a share of Bid Price.', { min: 0, max: 0.2, step: 0.005 }),
  build('build.perfSecurityCommissionPa', 'Performance Security Commission (p.a.)', 'percent', 'Annual bank commission on Performance Security.', { min: 0, max: 0.05, step: 0.0005 }),
  build('build.phasing', 'EPC Phasing', 'select', 'How EPC spend is spread over the build period.',
    { options: [{ value: 'equated', label: 'Equated monthly' }, { value: 'sCurve', label: 'S-curve' }] }),

  sup('support.pctOfBid', 'Construction Support (% of Bid)', 'percent', 'Total Construction Support from the Authority as a share of Bid Price.', { min: 0, max: 0.6, step: 0.01 }),
  sup('support.tranches', 'Support Tranches', 'number', 'Physical progress at which each Construction Support tranche is paid, and its share of Bid Price.'),

  cap('capital.equityPct', 'Equity Share of Funding', 'percent', 'Equity as a share of funding need; the rest is debt.', { min: 0, max: 1, step: 0.01 }),
  cap('capital.upfrontEquityPct', 'Upfront Equity', 'percent', 'Share of equity invested before debt is drawn.', { min: 0, max: 1, step: 0.05 }),
  cap('capital.shareCapitalPct', 'Share Capital (% of Equity)', 'percent', 'Share-capital portion of equity; the rest is promoter sub-debt (display split only).', { min: 0, max: 1, step: 0.05 }),
  debt('capital.buildRate', 'Loan Rate – Build', 'percent', 'Interest rate on senior debt during build.', { min: 0, max: 0.2, step: 0.0025, key: true }),
  debt('capital.operateRate', 'Loan Rate – Operate', 'percent', 'Interest rate on senior debt during operations.', { min: 0, max: 0.2, step: 0.0025, key: true }),
  debt('capital.repayment', 'Repayment Schedule', 'percentList', '25 half-yearly principal installments as shares of debt; must total 100%.'),
  debt('capital.maxLeverage', 'Max Debt / Equity', 'number', 'Health warning above this debt-to-equity ratio.', { min: 0, step: 0.1 }),
  debt('capital.dscrWarn', 'DSCR Warning Level', 'number', 'Health warning when minimum DSCR falls below this.', { min: 1, step: 0.05 }),

  inc('income.completionPctOfBid', 'Completion Payments (% of Bid)', 'percent', 'Share of Bid Price paid after completion as Completion Payments.', { min: 0, max: 1, step: 0.01 }),
  inc('income.installments', 'Completion Payment Schedule', 'percentList', '30 half-yearly shares of the Completion Payments; must total 100%.'),
  inc('income.firstPaymentLagDays', 'First Payment Lag', 'days', 'Days from Completion Date to the first payment.', { min: 0, step: 5 }),
  rate('income.bankRates', 'Reference Lending Rates', 'percentList', 'Five bank reference rates averaged for the Annuity Rate.', { key: true }),
  rate('income.spread', 'Annuity Spread', 'percent', 'Spread added to the average reference rate.', { min: 0, max: 0.05, step: 0.0005 }),
  rate('income.rateQuoteDate', 'Rate Quote Date', 'date', 'Date the reference rates were quoted.'),
  rate('income.maxQuoteAgeMonths', 'Max Quote Age (months)', 'number', 'Health warning when rate quotes are older than this.', { min: 0, step: 1 }),
  inc('income.omBaseRate', 'O&M Payment – Base', 'percent', 'Annual O&M payment as a share of Bid Price in ordinary years.', { min: 0, max: 0.05, step: 0.0005 }),
  inc('income.omResurfacingRate', 'O&M Payment – Resurfacing Year', 'percent', 'Annual O&M payment as a share of Bid Price in a resurfacing year.', { min: 0, max: 0.1, step: 0.0005 }),
  inc('income.omPreResurfacingFlexible', 'O&M Payment – Pre-resurfacing (Flexible)', 'percent', 'O&M payment rate in the year before resurfacing, flexible pavement.', { min: 0, max: 0.05, step: 0.0005 }),
  inc('income.omPreResurfacingPerpetual', 'O&M Payment – Pre-resurfacing (Perpetual)', 'percent', 'O&M payment rate in the year before resurfacing, perpetual pavement.', { min: 0, max: 0.05, step: 0.0005 }),

  idx('indexation.wpi', 'WPI Inflation', 'percent', 'Assumed annual wholesale price inflation.', { min: 0, max: 0.2, step: 0.005, key: true }),
  idx('indexation.cpi', 'CPI Inflation', 'percent', 'Assumed annual consumer price inflation.', { min: 0, max: 0.2, step: 0.005, key: true }),
  idx('indexation.wpiWeight', 'WPI Weight', 'percent', 'Weight of WPI in the Indexation Factor; CPI gets the rest.', { min: 0, max: 1, step: 0.05 }),

  ops('operations.routine', 'Routine Maintenance', 'money', 'Annual routine maintenance in ₹ Cr at bid-date prices.', { min: 0, step: 0.1, key: true }),
  ops('operations.electricity', 'Electricity', 'money', 'Annual electricity cost in ₹ Cr at bid-date prices.', { min: 0, step: 0.1 }),
  ops('operations.financeLegal', 'Finance & Legal (Operations)', 'money', 'Annual finance and legal cost in ₹ Cr.', { min: 0, step: 0.1 }),
  ops('operations.staff', 'SPV Staff', 'money', 'Annual SPV staff cost in ₹ Cr.', { min: 0, step: 0.1 }),
  ops('operations.patrolRunning', 'Patrol Vehicle Running', 'money', 'Annual patrol vehicle running cost in ₹ Cr.', { min: 0, step: 0.01 }),
  ops('operations.ieFee', 'Independent Engineer Fee (Operations)', 'money', 'Annual Independent Engineer fee in ₹ Cr.', { min: 0, step: 0.1 }),
  ops('operations.insuranceBaseRate', 'Insurance Base Rate', 'percent', 'Insurance premium base rate applied to EPC.', { min: 0, max: 0.01, step: 0.0001 }),
  ops('operations.insuranceLoading', 'Insurance Loading', 'number', 'Multiplier on the base rate (2.15 means 2.15x).', { min: 0, step: 0.05 }),
  ops('operations.majorMaintenance', 'Major Maintenance', 'money', 'Cost in ₹ Cr of each resurfacing, at bid-date prices.', { min: 0, step: 0.5, key: true }),
  ops('operations.resurfacingYears', 'Resurfacing Years', 'years', 'The two operating years in which resurfacing is done.'),
  infl('operations.inflation.maintenance', 'Maintenance Inflation', 'percent', 'Annual inflation on maintenance costs.', { min: 0, max: 0.2, step: 0.005 }),
  infl('operations.inflation.staff', 'Staff Inflation', 'percent', 'Annual inflation on staff costs.', { min: 0, max: 0.2, step: 0.005 }),
  infl('operations.inflation.electricity', 'Electricity Inflation', 'percent', 'Annual inflation on electricity costs.', { min: 0, max: 0.2, step: 0.005 }),
  infl('operations.inflation.insurance', 'Insurance Inflation', 'percent', 'Annual inflation on insurance costs.', { min: 0, max: 0.2, step: 0.005 }),

  tax('tax.baseRate', 'Base Tax Rate', 'percent', 'Corporate tax rate before surcharge and cess.', { min: 0, max: 0.5, step: 0.005 }),
  tax('tax.surcharge', 'Surcharge', 'percent', 'Surcharge on tax.', { min: 0, max: 0.5, step: 0.01 }),
  tax('tax.cess', 'Cess', 'percent', 'Health and education cess on tax and surcharge.', { min: 0, max: 0.2, step: 0.01 }),
  tgt('targets.equityIrrHurdle', 'Equity IRR Hurdle', 'percent', 'Target equity return; used by the Solve Bid Price control and Health.', { min: 0, max: 0.5, step: 0.005 }),
]

const byId = new Map(FIELDS.map(x => [x.id, x]))
export const fieldById = (id: string): FieldDef | undefined => byId.get(id)
