"""Export V16 values to golden JSON.

Usage: extract_golden.py <v16.xlsx> <out.json>   (or V16_PATH env for the workbook)

Importable: export_golden(get, set_name, inputs) where get(sheet, row, col) -> raw cell value
(1-based row/col; datetime / number / str / None). Excel-COM readers can reuse it.

Layout per sheet (values[i] is column first+i; date rows give cols[sheet] / cols["sheet#row"]):
  Fin-IGAAP  label C|B|A, total D, values E..W,   dates row 3
  Fin-INDAS  label C|B|A, total D, values E..W,   dates row 3
  COP-MOF    label C,     total G, values H..BO,  dates row 9 (month end); "#11" = FY end
  Revenue    label C,     total D, values F..AS,  dates row 5 (month end); "#4" = payment date
  Debt       label B,     total C, values D..ER,  dates row 23 (1st annuity-end block); "#7" = COD block
  O&M Cost   label D|C,   total I, values J..BQ,  dates row 11
  Inflation  label B,     none,    values D..AK,  dates row 9; "#12" = FY row of the rate table
  DB         label B,     total C, values D..AM,  dates row 60 (annuities); "#63" FY; "#91" MMR FY
             rows 11-19 (key dates), 39-67, 83-106; date cells in data rows become Excel serials.

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


SHEETS = {
    'Fin-IGAAP': dict(label=[3, 2, 1], total=4, first=5, last=23, rows=R(1, 417), dates=[3]),
    'Fin-INDAS': dict(label=[3, 2, 1], total=4, first=5, last=23, rows=R(1, 448), dates=[3]),
    'COP-MOF': dict(label=[3], total=7, first=8, last=67, rows=R(1, 390), dates=[9, 11]),
    'Revenue': dict(label=[3], total=4, first=6, last=45, rows=R(1, 54), dates=[5, 4]),
    'Debt': dict(label=[2], total=3, first=4, last=148, rows=R(1, 36), dates=[23, 7]),
    'O&M Cost': dict(label=[4, 3], total=9, first=10, last=69, rows=R(1, 106), dates=[11]),
    'Inflation': dict(label=[2], total=None, first=4, last=37, rows=R(7, 60), dates=[9, 12]),
    'DB': dict(label=[2], total=3, first=4, last=39, rows=R(11, 19) + R(39, 67) + R(83, 106),
               dates=[60, 63, 91]),
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
        return float(f'{v:.12g}')
    return None


def iso(v):
    return v.strftime('%Y-%m-%d') if isinstance(v, (dt.datetime, dt.date)) else None


def export_golden(get, set_name='sample', inputs=None):
    cells, cols = {}, {}
    for sheet, c in SHEETS.items():
        span = R(c['first'], c['last'])
        for i, dr in enumerate(c['dates']):
            cols[sheet if i == 0 else f'{sheet}#{dr}'] = [iso(get(sheet, dr, k)) for k in span]
        for r in c['rows']:
            vals = [num(get(sheet, r, k)) for k in span]
            tot = num(get(sheet, r, c['total'])) if c['total'] else None
            if tot is None and all(v is None for v in vals):
                continue
            texts = (get(sheet, r, k) for k in c['label'])
            label = next((x.strip() for x in texts if isinstance(x, str) and x.strip()), '')
            while vals and vals[-1] is None:  # trim trailing empties (values[i] = column first+i)
                vals.pop()
            cells[f'{sheet}!{r}'] = dict(label=label, total=tot, values=vals)
    kpis = {k: num(get(s, int(a[1:]), ord(a[0]) - 64)) for s, d in KPIS.items() for k, a in d.items()}
    meta = dict(set=set_name, inputs=inputs or {}, extracted=dt.date.today().isoformat(),
                layout={s: {k: c[k] for k in ('first', 'last', 'total')} for s, c in SHEETS.items()})
    return dict(meta=meta, cells=cells, cols=cols, kpis=kpis)


def main(argv):
    import openpyxl
    src = argv[1] if len(argv) > 1 else os.environ.get('V16_PATH')
    out = argv[2] if len(argv) > 2 else None
    if not src or not out:
        sys.exit('usage: extract_golden.py <v16.xlsx> <out.json>  (or V16_PATH env)')
    wb = openpyxl.load_workbook(src, data_only=True)
    g = export_golden(lambda s, r, c: wb[s].cell(r, c).value)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(g, f, separators=(',', ':'), ensure_ascii=False)
    print(f"{out}: {os.path.getsize(out) / 1e6:.2f} MB, {len(g['cells'])} rows")


if __name__ == '__main__':
    main(sys.argv)
