"""Export V16 values to golden JSON.

Usage: extract_golden.py <v16.xlsx> <out.json>   (or V16_PATH env for the workbook)

Importable: export_golden(get, extent, set_name, inputs): get(sheet, row, col) -> raw cell value
(1-based; datetime / number / str / None), extent(sheet) -> (max_row, max_col). Excel-COM readers can reuse it.

Layout per sheet (all non-empty rows; values[i] is column first+i, running to the sheet's last used
column; values keep nulls so every row has the same length as cols). Date rows give cols[sheet] and
cols["sheet#row"]. Date cells in data rows become Excel serials.
  Fin-IGAAP  label C|B|A, total D, first E,  dates row 3
  Fin-INDAS  label C|B|A, total D, first E,  dates row 3
  COP-MOF    label C,     total G, first H,  dates row 9 (month end); "#11" = FY end
  Revenue    label C,     total D, first E,  dates row 5 (month end); "#4" = payment date
  Debt       label B,     total C, first D,  dates row 23 (1st annuity-end block); "#7" = COD block
  O&M Cost   label D|C,   total I, first E,  dates row 11
  Inflation  label B,     none,    first C,  dates row 9; "#12" = FY row of the rate table
  DB         label B,     none,    first C,  dates row 60 (annuities); #63 FY, #91 MMR FY, #72 MA dates,
             #77 milestone month end, #78 milestone FY
Numeric cells left of `first` (not the total) go in row.lead keyed by 1-based column; export_golden
raises if any numeric cell in the sheet's used range is not exported.

KPI source cells (kpis):
  Fin-IGAAP: equityIrrHalfYearly D194, equityIrrHalfYearlyPre D195, projectIrrPreAnnual D169,
    projectIrrPostAnnual D170, equityIrrAnnualPre D171, equityIrrAnnualPost D172,
    equityIrrMobAdjPost D207, equityIrrMobAdjPre D208, dscrAvg D143, dscrMin D144, dscrMax D145
  Fin-INDAS (suffix Indas): projectIrrPreAnnualIndas D185, projectIrrPostAnnualIndas D186,
    equityIrrAnnualPreIndas D187, equityIrrAnnualPostIndas D188, equityIrrHalfYearlyIndas D209,
    equityIrrHalfYearlyPreIndas D210, dscrAvgIndas D159, dscrMinIndas D160, dscrMaxIndas D161
"""
import datetime as dt
import json
import os
import sys
from math import isfinite

from openpyxl.utils.datetime import to_excel


def R(a, b):
    return list(range(a, b + 1))


# first = first value column (values[i] is column first+i); every sheet runs to its full used extent.
SHEETS = {
    'Fin-IGAAP': dict(label=[3, 2, 1], total=4, first=5, dates=[3]),
    'Fin-INDAS': dict(label=[3, 2, 1], total=4, first=5, dates=[3]),
    'COP-MOF': dict(label=[3], total=7, first=8, dates=[9, 11]),
    'Revenue': dict(label=[3], total=4, first=5, dates=[5, 4]),
    'Debt': dict(label=[2], total=3, first=4, dates=[23, 7]),
    'O&M Cost': dict(label=[4, 3], total=9, first=5, dates=[11]),
    'Inflation': dict(label=[2], total=None, first=3, dates=[9, 12]),
    'DB': dict(label=[2], total=None, first=3, dates=[60, 63, 91, 72, 77, 78]),
}
KPIS = {
    'Fin-IGAAP': dict(equityIrrHalfYearly='D194', equityIrrHalfYearlyPre='D195', projectIrrPreAnnual='D169',
                      projectIrrPostAnnual='D170', equityIrrAnnualPre='D171', equityIrrAnnualPost='D172',
                      equityIrrMobAdjPost='D207', equityIrrMobAdjPre='D208', dscrAvg='D143', dscrMin='D144',
                      dscrMax='D145'),
    'Fin-INDAS': dict(projectIrrPreAnnualIndas='D185', projectIrrPostAnnualIndas='D186',
                      equityIrrAnnualPreIndas='D187', equityIrrAnnualPostIndas='D188',
                      equityIrrHalfYearlyIndas='D209', equityIrrHalfYearlyPreIndas='D210',
                      dscrAvgIndas='D159', dscrMinIndas='D160', dscrMaxIndas='D161'),
}


def num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (dt.datetime, dt.date)):
        v = to_excel(v)
    if isinstance(v, (int, float)) and isfinite(v):
        return float(v)  # full precision; json writes the shortest round-trip repr
    return None


def iso(v):
    return v.strftime('%Y-%m-%d') if isinstance(v, (dt.datetime, dt.date)) else None


def export_golden(get, extent, set_name='sample', inputs=None):
    """extent(sheet) -> (max_row, max_col) of the used range. Fails if a numeric/date cell lies
    outside label, total and value columns (i.e. the layout below would silently drop it)."""
    cells, cols = {}, {}
    for sheet, c in SHEETS.items():
        max_row, max_col = extent(sheet)
        span = R(c['first'], max_col)
        for i, dr in enumerate(c['dates']):
            cols[sheet if i == 0 else f'{sheet}#{dr}'] = [iso(get(sheet, dr, k)) for k in span]
        known = {c['total']} if c['total'] else set()
        for r in range(1, max_row + 1):
            # numeric cells left of `first` that are not the total (e.g. COP-MOF rates in A..F)
            lead = {k: v for k in range(1, c['first']) if k not in known
                    for v in [num(get(sheet, r, k))] if v is not None}
            vals = [num(get(sheet, r, k)) for k in span]
            tot = num(get(sheet, r, c['total'])) if c['total'] else None
            texts = (get(sheet, r, k) for k in c['label'])
            label = next((x.strip() for x in texts if isinstance(x, str) and x.strip()), '')
            if tot is None and not label and not lead and all(v is None for v in vals):
                continue
            row = dict(label=label, total=tot, values=vals)
            if lead:
                row['lead'] = {str(k): v for k, v in lead.items()}  # keyed by 1-based column
            cells[f'{sheet}!{r}'] = row
        seen = sum(num(get(sheet, r, k)) is not None for r in range(1, max_row + 1)
                   for k in range(1, max_col + 1))
        kept = sum((row['total'] is not None and c['total'] < c['first']) + len(row.get('lead', ())) + sum(
            v is not None for v in row['values']) for key, row in cells.items()
            if key.startswith(sheet + '!'))
        if seen != kept:  # a numeric cell in the used range was not exported
            raise ValueError(f'{sheet}: {seen - kept} numeric cells in the used range not exported')
    kpis = {k: num(get(s, int(a[1:]), ord(a[0]) - 64)) for s, d in KPIS.items() for k, a in d.items()}
    meta = dict(set=set_name, inputs=inputs or {}, extracted=dt.date.today().isoformat(),
                layout={s: dict(first=c['first'], last=extent(s)[1], total=c['total'])
                        for s, c in SHEETS.items()})
    return dict(meta=meta, cells=cells, cols=cols, kpis=kpis)


def main(argv):
    import openpyxl
    src = argv[1] if len(argv) > 1 else os.environ.get('V16_PATH')
    out = argv[2] if len(argv) > 2 else None
    if not src or not out:
        sys.exit('usage: extract_golden.py <v16.xlsx> <out.json>  (or V16_PATH env)')
    wb = openpyxl.load_workbook(src, data_only=True)
    missing = [n for n in SHEETS if n not in wb.sheetnames]
    if missing:
        sys.exit(f'workbook lacks sheets: {missing}')
    g = export_golden(lambda s, r, c: wb[s].cell(r, c).value,
                      lambda s: (wb[s].max_row, wb[s].max_column))
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(g, f, separators=(',', ':'), ensure_ascii=False)
    print(f"{out}: {os.path.getsize(out) / 1e6:.2f} MB, {len(g['cells'])} rows")


if __name__ == '__main__':
    main(sys.argv)
