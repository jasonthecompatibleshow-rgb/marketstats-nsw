"""Generic parser for DCJ Rent and Sales Report postcode tables (all issues since Sep 2017).
Column order and labels vary between issues, so columns are located by header text."""
import re, pathlib, openpyxl

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DWELL = {"total": "A", "flat/unit": "U", "flat/units": "U", "house": "H", "townhouse": "T"}
BEDS = {"total": "t", "1 bedroom": "1", "2 bedrooms": "2", "3 bedrooms": "3", "4 or more bedrooms": "4", "4 bedrooms or more": "4", "4+ bedrooms": "4"}
SALE = {"total": "A", "strata": "S", "non strata": "N", "non-strata": "N"}


def file_quarter(name):
    """'issue-140-rent-tables-june-2022.xlsx' -> ('rent', '2022Q2')"""
    n = name.lower()
    kind = "rent" if "rent" in n else "sales" if "sales" in n else None
    m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ](20\d\d)", n)
    if not kind or not m: return kind, None
    return kind, f"{m.group(2)}Q{(MONTHS[m.group(1)] + 2) // 3}"


def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace(",", "").replace("$", "")
    if s in ("-", "s", "", "na", "n.a."): return None
    if s.endswith("%"): s = s[:-1]
    try: return float(s)
    except ValueError: return None


def _rows(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[next(s for s in wb.sheetnames if "postcode" in s.lower())]
    rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if r[0] and str(r[0]).strip().lower().startswith("postcode") and sum(x is not None for x in r) > 4)
    head = [re.sub(r"\s+", " ", str(x or "")).lower() for x in rows[h]]
    def col(*pats, exclude=()):
        for i, t in enumerate(head):
            if all(p in t for p in pats) and not any(e in t for e in exclude): return i
        return None
    return head, col, rows[h + 1:]


def parse_rent(path):
    head, col, rows = _rows(path)
    cd, cb = col("dwelling"), col("bedroom")
    cm, cn, ch = col("median", exclude=("change",)), col("bonds lodged", exclude=("change",)), col("bonds held", exclude=("change",))
    ca = col("annual", "median")
    out = []
    for r in rows:
        if r[0] is None or not str(r[0]).strip().isdigit(): continue
        d, b = DWELL.get(str(r[cd]).strip().lower()), BEDS.get(str(r[cb]).strip().lower())
        if not d or not b: continue
        out.append(dict(poa=str(int(r[0])), d=d, b=b, rent=num(r[cm]), bonds=num(r[cn]), low=str(r[cn]).strip() == "s",
                        held=num(r[ch]) if ch is not None else None, rent_ach=num(r[ca]) if ca is not None else None))
    return out


def parse_sales(path):
    head, col, rows = _rows(path)
    cd, cm = col("dwelling"), col("median", exclude=("change",))
    cn, ca = col("sales no"), col("annual", "median")
    if cn is None: cn = next(i for i, t in enumerate(head) if t.startswith("sales"))
    out = []
    for r in rows:
        if r[0] is None or not str(r[0]).strip().isdigit(): continue
        s = SALE.get(str(r[cd]).strip().lower())
        if not s: continue
        med = num(r[cm])
        out.append(dict(poa=str(int(r[0])), s=s, price=med * 1000 if med else None, sales=num(r[cn]),
                        low=str(r[cn]).strip() == "s", price_ach=num(r[ca]) if ca is not None else None))
    return out
