"""Drive V16 in Excel (COM) at an input set and save its golden.

Usage: run_differential.py <v16.xlsx> <set|all|sample> [out_dir]   (or V16_PATH env for the workbook)

Sets, the Inputs-path -> cell map and any hard-code patches live in io_map.json next to this file.
Works on a temp copy (the original is never saved). Iterative calc on (1000 iterations, max change 1e-9);
CalculateFull repeats until two consecutive passes agree to 1e-9 on every numeric cell of the exported
sheets (meta.v16Residual = max abs change on the last pass). Values go through extract_golden.export_golden.
Stops (exit 2) if a pass limit is hit or an exported sheet shows an Excel error the unchanged workbook does not.
`sample` writes the tight recalculation of the unchanged, unpatched workbook as golden/sample.json and reports
its gap to golden/sample-cached.json (V16's cached values, exported by extract_golden.py).
"""
import datetime as dt
import json
import os
import shutil
import sys
import tempfile

import win32com.client as win32
from openpyxl.utils.datetime import from_excel

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from extract_golden import SHEETS, export_golden  # noqa: E402

GOLDEN = os.path.join(HERE, '..', '..', 'src', 'engine', 'v16', 'golden')
ERR = {-2146826281: '#DIV/0!', -2146826246: '#N/A', -2146826259: '#NAME?', -2146826288: '#NULL!',
       -2146826252: '#NUM!', -2146826265: '#REF!', -2146826273: '#VALUE!'}
TOL, MAX_PASSES = 1e-9, 30


def split(ref):  # "'1. IO '!B6" -> ('1. IO ', 'B6')
    s, a = ref.rsplit('!', 1)
    return s.strip("'"), a


class Book:
    def __init__(self, wb):
        self.wb, self.grid = wb, {}

    def rng(self, ref):
        s, a = split(ref)
        return self.wb.Worksheets(s).Range(a)

    def read(self):
        """Snapshot every exported sheet: Value2 (exact numbers) plus Value (to spot date cells)."""
        self.grid = {}
        for s in SHEETS:
            ur = self.wb.Worksheets(s).UsedRange
            v2, v = ur.Value2, ur.Value
            if not isinstance(v2, tuple):
                v2, v = ((v2,),), ((v,),)
            self.grid[s] = (ur.Row, ur.Column, v2, v)

    def extent(self, s):
        r0, c0, v2, _ = self.grid[s]
        return r0 + len(v2) - 1, c0 + len(v2[0]) - 1

    def get(self, s, r, c):
        r0, c0, v2, v = self.grid[s]
        i, j = r - r0, c - c0
        if i < 0 or j < 0 or i >= len(v2) or j >= len(v2[0]):
            return None
        x = v2[i][j]
        if isinstance(x, int) and x in ERR:
            return ERR[x]  # text -> exported as null
        if isinstance(v[i][j], dt.datetime):
            return from_excel(x)  # exact serial -> naive datetime (µs)
        return x

    def numbers(self):
        out = {}
        for s, (r0, c0, v2, _) in self.grid.items():
            for i, row in enumerate(v2):
                for j, x in enumerate(row):
                    if isinstance(x, float) or (isinstance(x, int) and x not in ERR and not isinstance(x, bool)):
                        out[(s, r0 + i, c0 + j)] = float(x)
        return out

    def errors(self):
        return {(s, r0 + i, c0 + j): ERR[x] for s, (r0, c0, v2, _) in self.grid.items()
                for i, row in enumerate(v2) for j, x in enumerate(row) if isinstance(x, int) and x in ERR}


def converge(xl, book):
    prev, res = None, None
    for n in range(1, MAX_PASSES + 1):
        xl.CalculateFull()
        book.read()
        cur = book.numbers()
        if prev is not None:
            keys = cur.keys() | prev.keys()
            res = max((abs(cur.get(k, 0.0) - prev.get(k, 0.0)) for k in keys), default=0.0)
            if res <= TOL:
                return n, res
        prev = cur
    raise RuntimeError(f'no convergence after {MAX_PASSES} passes (last change {res})')


def run(xl, src, set_name, io):
    tmp = tempfile.mkdtemp(prefix='v16diff-')
    path = os.path.join(tmp, os.path.basename(src))
    shutil.copy(src, path)
    wb = xl.Workbooks.Open(path, UpdateLinks=0)
    try:
        xl.Calculation = -4135  # manual: inputs first, then CalculateFull
        xl.Iteration, xl.MaxIterations, xl.MaxChange = True, 1000, TOL
        book = Book(wb)
        paths = io['paths']
        converge(xl, book)
        base_err = book.errors()
        before = {p: book.rng(m.get('write') or m['derived']).Value2 for p, m in paths.items()}
        inputs = {}
        for p, v in io['sets'].get(set_name, {}).items():
            m = paths[p]
            book.rng(m['write']).Value2 = m.get('values', {}).get(v, v)
            inputs[p] = v
        patches = []
        for pt in io.get('patches', {}).get(set_name, []):
            r = book.rng(pt['cell'])
            old = r.Formula
            if 'fillFrom' in pt:  # fill right: each target row gets its source cell's R1C1 formula
                src_f = book.rng(pt['fillFrom']).FormulaR1C1
                rows = [x[0] for x in src_f] if isinstance(src_f, tuple) else [src_f]
                r.FormulaR1C1 = tuple((f,) * r.Columns.Count for f in rows)
                # one record per row: `new` = the A1 formula now in the row's first target cell (rest filled right)
                for i in range(r.Rows.Count):
                    row = r.Rows(i + 1)
                    a = row.Address.replace('$', '')
                    o = old[i] if isinstance(old, tuple) else (old,)
                    patches.append(dict(cell=f"'{row.Worksheet.Name}'!{a}", old=''.join(o),
                                        new=row.Cells(1, 1).Formula, why=pt['why']))
            else:
                r.Formula = pt['new']
                patches.append(dict(cell=pt['cell'], old=old, new=pt['new'], why=pt['why']))
        passes, residual = converge(xl, book)
        for p, m in paths.items():  # knock-on values of mapped cells V16 computes itself
            if 'derived' in m:
                after = book.rng(m['derived']).Value2
                if after != before[p]:
                    inputs[p] = after
        new_err = {k: e for k, e in book.errors().items() if k not in base_err}
        if new_err:
            raise RuntimeError(f'{len(new_err)} new Excel errors in exported sheets, e.g. {list(new_err.items())[:10]}')
        g = export_golden(book.get, book.extent, set_name, inputs)
        g['meta']['v16Residual'] = residual
        g['meta']['passes'] = passes
        if patches:
            g['meta']['patches'] = patches
        return g
    finally:
        wb.Close(False)
        shutil.rmtree(tmp, ignore_errors=True)


def compare(a, b):
    """Max abs diff over every numeric value a and b share; plus keys present in only one."""
    worst, where, only = 0.0, None, []
    for k in a['cells'].keys() | b['cells'].keys():
        if k not in a['cells'] or k not in b['cells']:
            only.append(k)
            continue
        ra, rb = a['cells'][k], b['cells'][k]
        for i, (x, y) in enumerate(zip([ra['total']] + ra['values'], [rb['total']] + rb['values'])):
            if (x is None) != (y is None):
                only.append(f'{k}[{i - 1}]')
            elif x is not None and abs(x - y) > worst:
                worst, where = abs(x - y), f'{k}[{i - 1}]'
    return worst, where, only


def main(argv):
    src = argv[1] if len(argv) > 1 else os.environ.get('V16_PATH')
    which = argv[2] if len(argv) > 2 else None
    out_dir = argv[3] if len(argv) > 3 else GOLDEN
    if not src or not which:
        sys.exit('usage: run_differential.py <v16.xlsx> <set|all|sample> [out_dir]  (or V16_PATH env)')
    io = json.load(open(os.path.join(HERE, 'io_map.json'), encoding='utf-8'))
    names = list(io['sets']) if which == 'all' else [which]
    xl = win32.DispatchEx('Excel.Application')
    xl.Visible, xl.DisplayAlerts = False, False
    try:
        for name in names:
            g = run(xl, os.path.abspath(src), name, io)
            m = g['meta']
            print(f"{name}: passes {m['passes']}, residual {m['v16Residual']:.3g}, inputs {m['inputs']}, "
                  f"patches {len(m.get('patches', []))}, equityIrr {g['kpis']['equityIrrHalfYearly']}")
            if name == 'sample':
                m['source'] = 'tight recalculation of the unchanged workbook'
                ref = json.load(open(os.path.join(GOLDEN, 'sample-cached.json'), encoding='utf-8'))
                worst, where, only = compare(g, ref)
                print(f'  vs sample-cached.json: max |diff| {worst:.3g} at {where}; cells in one only: {len(only)} {only[:10]}')
                if m['layout'] != ref['meta']['layout']:
                    raise RuntimeError(f"layout differs from the cached export: {m['layout']} vs {ref['meta']['layout']}")
            out = os.path.join(out_dir, f'{name}.json')
            with open(out, 'w', encoding='utf-8') as f:
                json.dump(g, f, separators=(',', ':'), ensure_ascii=False)
            print(f'  {out}: {os.path.getsize(out) / 1e6:.2f} MB, {len(g["cells"])} rows')
    except RuntimeError as e:
        print(f'STOP: {e}', file=sys.stderr)
        sys.exit(2)
    finally:
        xl.Quit()


if __name__ == '__main__':
    main(sys.argv)
