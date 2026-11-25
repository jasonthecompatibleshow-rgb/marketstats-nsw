"""Print sanity stats for watch-list postcodes. Usage: python etl/check.py [postcode ...]"""
import json, sys, pathlib
S = json.loads((pathlib.Path(__file__).resolve().parents[1] / "web/data/stats.json").read_text())
for p in sys.argv[1:] or ["2042", "2127", "2155"]:
    r = S[p]
    def f(k, fmt="{:,.0f}"):
        if k not in r: return "-"
        pre, rest = k.split("_", 1)
        flag = {"r": "rl", "rg": "rl", "y": "yl", "p": "pl"}.get(pre)
        return fmt.format(r[k]) + ("*" if flag and r.get(f"{flag}_{rest}") else "")
    print(f"\n{p} {', '.join(r['names'])}")
    print("  rent $/wk  all:", f("r_At"), " unit 1/2/3:", f("r_U1"), f("r_U2"), f("r_U3"), " house 3/4+:", f("r_H3"), f("r_H4"), " townhouse:", f("r_Tt"))
    print("  rent 12m%  all:", f("rg_At", "{:+.1f}"), " units:", f("rg_Ut", "{:+.1f}"), " houses:", f("rg_Ht", "{:+.1f}"))
    print("  price      all:", f("p_A"), " strata:", f("p_S"), " non-strata:", f("p_N"))
    print("  yield %    all:", f("y_At", "{:.2f}"), " units:", f("y_Ut", "{:.2f}"), " unit 2br:", f("y_U2", "{:.2f}"), " houses:", f("y_Ht", "{:.2f}"), " house 4br:", f("y_H4", "{:.2f}"))
print("\n* = small sample (11-30 bonds/sales)")
