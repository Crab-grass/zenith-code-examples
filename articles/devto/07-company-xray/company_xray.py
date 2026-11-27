#!/usr/bin/env python3
"""Company X-ray: pull 4 Japanese annual-report disclosures in one command."""
import json, os, sys, time, urllib.error, urllib.request

BASE = "https://api.zenithcode.net/stable"
ENDPOINTS = ("workforce", "diversity", "subsidiaries", "cross-shareholdings")

def fetch(ep, symbol, key):
    req = urllib.request.Request(f"{BASE}/{ep}?symbol={symbol}&limit=1", headers={"x-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            rows = json.load(res)
            return ("ok", rows[0]) if rows else ("empty", None)
    except urllib.error.HTTPError as e:
        if e.code == 404: return ("not_found", None)
        if e.code == 403: return ("plan_required", None)
        raise

pct = lambda v: "—" if v is None else f"{v * 100:.1f}%"
num = lambda v, u="": "—" if v is None else f"{v:,}{u}"

def format_xray(symbol, res):
    lines = [f"=== {symbol} ==="]
    st, wf = res["workforce"]
    if st != "ok":
        lines.append(f"  Workforce   : {st}")
    else:
        emp, cons = wf.get("employees"), wf.get("consolidatedEmployees")
        share = (emp / cons) if (emp is not None and cons) else None
        note = f" [parent only: {pct(share)} of group]" if (share is not None and share < 0.05) else ""
        lines.append(f"  Filing      : FY {wf.get('fiscalPeriod')} (docId {wf.get('docId')})")
        lines.append(f"  Workforce   : parent {num(emp)} / group {num(cons)} ({pct(share)}) | avg salary {num(wf.get('averageAnnualSalary'), ' JPY')}{note}")
    st, dv = res["diversity"]
    if st != "ok":
        lines.append(f"  Diversity   : {st}")
    else:
        rc = dv.get("reportingCompany") or {}
        lines.append(f"  Diversity   : female mgr {pct(rc.get('femaleManagerRatio'))} | male leave {pct(rc.get('maleChildcareLeaveRatio'))} ({rc.get('maleChildcareLeaveBasis') or 'basis: —'}) | pay gap all {pct(rc.get('wageGapAll'))} | subs {len(dv.get('subsidiaries') or [])}")
    st, sb = res["subsidiaries"]
    if st != "ok":
        lines.append(f"  Subsidiaries: {st}")
    else:
        counts = ", ".join(f"{k}={v}" for k, v in (sb.get("counts") or {}).items()) or "none"
        others = [f"{o.get('category') or 'other'}+{o.get('count')}" for o in (sb.get("otherCounts") or [])]
        notes_n = len(sb.get("otherNotes") or [])
        extra = f" | otherCounts: {', '.join(others)}" if others else (f" | otherNotes: {notes_n} note(s)" if notes_n else " | other: not stated")
        lines.append(f"  Subsidiaries: table [{counts}]{extra}")
    st, cs = res["cross-shareholdings"]
    if st != "ok":
        lines.append(f"  Holdings    : {'Business plan or higher required (HTTP 403)' if st == 'plan_required' else st}")
    else:
        holders = [h.get("companyName") or h.get("holder") for h in (cs.get("holders") or [])]
        parts = [f"{s.get('holder')}/{s.get('purpose')}/{s.get('listing')}={s.get('issues')}" for s in (cs.get("summary") or [])]
        lines.append(f"  Holdings    : holders={len(holders)} ({', '.join(holders)}) | issues: {', '.join(parts) or 'none'}")
    return "\n".join(lines)

if __name__ == "__main__":
    key = os.environ.get("ZENITH_API_KEY") or sys.exit("Set ZENITH_API_KEY first.")
    for i, sym in enumerate(sys.argv[1:] or ["7203"]):
        if i > 0: time.sleep(6.5)  # stay under 10 req/min on the free plan
        print(format_xray(sym, {ep: fetch(ep, sym, key) for ep in ENDPOINTS}))
