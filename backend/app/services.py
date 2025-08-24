from __future__ import annotations
from typing import List, Dict, Any, Literal
from datetime import datetime, timedelta, date

# helpers
def uid(i:int)->str: return f"id{i:06d}"
def start_of_week(d:date)->date: return d - timedelta(days=d.weekday())
def end_of_week(d:date)->date: return start_of_week(d)+timedelta(days=6)
def iso(d:date)->str: return d.isoformat()

def make_weeks(n:int=26)->List[Dict[str,Any]]:
    today = date.today()
    start = start_of_week(today + timedelta(days=(7 - today.weekday()) % 7 or 7))
    return [{"id":uid(i+1),"start":iso(start+timedelta(weeks=i)),"end":iso(start+timedelta(weeks=i, days=6))} for i in range(n)]

def weeks_from_dates(start_iso:str, end_iso:str)->List[Dict[str,Any]]:
    s = start_of_week(datetime.fromisoformat(start_iso).date())
    e = end_of_week(datetime.fromisoformat(end_iso).date())
    out=[]; cur=s; i=1
    while cur<=e:
        out.append({"id":uid(i),"start":iso(cur),"end":iso(cur+timedelta(days=6))}); i+=1
        cur = cur + timedelta(weeks=1)
    return out

def demo(with_dates:Dict[str,str]|None=None)->Dict[str,Any]:
    weeks = weeks_from_dates(with_dates["start"], with_dates["end"]) if with_dates else make_weeks(26)
    z = {w["id"]:0 for w in weeks}
    positives=[
        {"id":"sal","name":"Salary","type":"INFLOW","recur":{"kind":"WEEKLY","every":1,"amount":2000},"values":z.copy()},
        {"id":"bon","name":"Bonus","type":"INFLOW","recur":{"kind":"CUSTOM","every":13,"amount":1000},"values":z.copy()},
    ]
    negatives=[
        {"id":"mort","name":"Mortgage","type":"OUTFLOW","recur":{"kind":"MONTHLY","every":1,"amount":-1200},"values":z.copy()},
        {"id":"kg","name":"Kindergarten","type":"OUTFLOW","recur":{"kind":"WEEKLY","every":1,"amount":-200},"values":z.copy()},
        {"id":"gro","name":"Groceries","type":"OUTFLOW","recur":{"kind":"WEEKLY","every":1,"amount":-150},"values":z.copy()},
        {"id":"nfx","name":"Netflix","type":"OUTFLOW","recur":{"kind":"MONTHLY","every":1,"amount":-15},"values":z.copy()},
        {"id":"sav","name":"Savings","type":"OUTFLOW","recur":{"kind":"WEEKLY","every":1,"amount":-100},"values":z.copy()},
        {"id":"adj","name":"Adjustment","type":"OUTFLOW","values":z.copy(),"isAdjustment":True},
    ]
    return {"bop0":1500,"weeks":weeks,"positives":positives,"negatives":negatives}

def is_monthly_hit(week_start_iso:str, anchor_iso:str)->bool:
    w = datetime.fromisoformat(week_start_iso).date()
    anchor = datetime.fromisoformat(anchor_iso).date()
    for d in range(7):
        if (w+timedelta(days=d)).day == anchor.day:
            return True
    return False

def materialize(model:Dict[str,Any])->None:
    if not model["weeks"]: return
    anchor = model["weeks"][0]["start"]
    def apply(row:Dict[str,Any]):
        r = row.get("recur")
        if not r: return
        amt = float(r.get("amount",0))
        for i,w in enumerate(model["weeks"]):
            wid = w["id"]
            if float(row["values"].get(wid,0)) != 0:
                continue
            k = r.get("kind")
            if k=="WEEKLY":
                row["values"][wid]=amt
            elif k=="BIWEEKLY":
                row["values"][wid]=amt if (i%2==0) else 0
            elif k=="MONTHLY":
                row["values"][wid]=amt if is_monthly_hit(w["start"], anchor) else 0
            elif k=="CUSTOM":
                n=int(r.get("every",1))
                row["values"][wid]=amt if (i % n)==0 else 0
    for r in model["positives"]: apply(r)
    for r in model["negatives"]: apply(r)

def totals_by_week(model:Dict[str,Any])->Dict[str,Dict[str,float]]:
    totals={}
    for i,w in enumerate(model["weeks"]):
        wid=w["id"]
        pos=sum(float(r["values"].get(wid,0)) for r in model["positives"])
        neg=sum(float(r["values"].get(wid,0)) for r in model["negatives"])
        net = pos + neg
        bop = float(model["bop0"]) if i==0 else totals[model["weeks"][i-1]["id"]]["eop"]
        eop = bop + net
        totals[wid]={"pos":pos,"neg":neg,"net":net,"bop":bop,"eop":eop}
    return totals

def month_key(d_iso:str)->str:
    d = datetime.fromisoformat(d_iso).date()
    return f"{d.year}-{d.month:02d}"
def quarter_key(d_iso:str)->str:
    d = datetime.fromisoformat(d_iso).date()
    q=(d.month-1)//3+1
    return f"{d.year}-Q{q}"
def year_key(d_iso:str)->str:
    d = datetime.fromisoformat(d_iso).date()
    return f"{d.year}"

def month_label(k:str)->str:
    y,m = k.split("-")
    dt = date(int(y), int(m), 1)
    return dt.strftime("%b %y")

def build_periods(model:Dict[str,Any], gran:Literal["WEEK","MONTH","QUARTER","YEAR"])->list[dict]:
    if gran=="WEEK":
        return [{"id":w["id"],"label":datetime.fromisoformat(w["start"]).date().strftime("%b %d"),"weeks":[w["id"]]} for w in model["weeks"]]
    mp={}
    for w in model["weeks"]:
        if gran=="MONTH": k=month_key(w["start"]); label=month_label(k)
        elif gran=="QUARTER": k=quarter_key(w["start"]); label=k
        else: k=year_key(w["start"]); label=k
        mp.setdefault(k,{"id":k,"label":label,"weeks":[]})
        mp[k]["weeks"].append(w["id"])
    return list(mp.values())

def fmt_eur(n:float)->str:
    s=f"€{n:,.0f}".replace(",","_")
    return s.replace(".",",").replace("_",".")

def render_html(model:Dict[str,Any], settings:Dict[str,Any])->str:
    gran = settings.get("gran","MONTH")
    eop_threshold = float(settings.get("alert",0))
    collapse = bool(settings.get("collapse", False))

    totals = totals_by_week(model)
    periods = build_periods(model, gran)

    last_eop = totals[model["weeks"][-1]["id"]]["eop"] if model["weeks"] else 0.0
    hits=[]
    for w in model["weeks"]:
        if totals[w["id"]]["eop"] < eop_threshold:
            d=datetime.fromisoformat(w["start"]).date()
            hits.append(d.strftime("%b %d"))
    cards = f'''
    <div class="cards">
      <div class="card"><h3>Final EoP</h3><div class="big">{fmt_eur(last_eop)}</div><div class="sub">Cash at the end of the horizon</div></div>
      <div class="card"><h3>Alerts</h3><div class="big {'bad' if hits else ''}">{len(hits)}</div><div class="chips">{''.join(f'<span class="chip">{h}</span>' for h in hits[:8])}{('' if len(hits)<=8 else f'<span class="chip">+{len(hits)-8} more</span>')}</div><div class="sub">EoP &lt; threshold</div></div>
      <div class="card"><h3>View</h3><div class="big">{gran.title()}</div><div class="sub">{'Collapsed' if collapse else 'Expanded'}</div></div>
    </div>'''

    thead=['<thead>']
    thead.append('<tr class="periods">')
    thead.append('<th class="sticky">Item / Period</th>')
    for p in periods:
        symbol = "-" if not collapse else "+"
        thead.append(f'<th colspan="{len(p["weeks"])}"><button class="collapse-toggle" data-pid="{p["id"]}">{symbol}</button> {p["label"]}</th>')
    thead.append('</tr>')
    thead.append('<tr class="weeks">'); thead.append('<th class="sticky"></th>')
    if not collapse or gran=="WEEK":
        for p in periods:
            for wid in p["weeks"]:
                w = next(w for w in model["weeks"] if w["id"]==wid)
                d = datetime.fromisoformat(w["start"]).date().strftime("%b %d")
                thead.append(f"<th>{d}</th>")
    thead.append('</tr>'); thead.append('</thead>')

    def row_cells(row:Dict[str,Any])->str:
        cells=[]
        if not collapse or gran=="WEEK":
            for p in periods:
                for wid in p["weeks"]:
                    v = float(row["values"].get(wid,0))
                    dis_attr = "" if (gran=="WEEK") else (" disabled" if row["name"].lower()=="savings" else "")
                    cells.append(f'<td><input class="cell" type="number" value="{v}" data-row="{row["id"]}" data-wid="{wid}"{dis_attr} onfocus="this.select()"></td>')
        else:
            for p in periods:
                s = sum(float(row["values"].get(wid,0)) for wid in p["weeks"])
                cells.append(f'<td class="agg">Σ {fmt_eur(s)}</td>')
        return "".join(cells)

    tbody=['<tbody>']
    tbody.append(f'<tr class="section inflows"><td class="sticky">Inflows</td>{"".join("<td></td>" for _ in range(sum(len(p["weeks"]) for p in periods) if not collapse or gran=="WEEK" else len(periods)))}</tr>')
    for r in model["positives"]:
        tbody.append('<tr class="row inflow-row">')
        tbody.append(f'<td class="sticky"><div class="rowname"><span class="name">{r["name"]}</span> <button class="recurrence" data-section="positives" data-row="{r["id"]}">📅</button> <button class="delete" data-section="positives" data-row="{r["id"]}">🗑</button></div></td>')
        tbody.append(row_cells(r)); tbody.append('</tr>')
    tbody.append(f'<tr class="section outflows"><td class="sticky">Outflows</td>{"".join("<td></td>" for _ in range(sum(len(p["weeks"]) for p in periods) if not collapse or gran=="WEEK" else len(periods)))}</tr>')
    for r in model["negatives"]:
        css = "adjustment-row" if r.get("isAdjustment") else "outflow-row"
        tag_html = '<span class="tag">Adjustment</span>' if r.get("isAdjustment") else ''
        tbody.append(f'<tr class="{css}">')
        tbody.append(f'<td class="sticky"><div class="rowname"><span class="name">{r["name"]}</span> {tag_html} <button class="recurrence" data-section="negatives" data-row="{r["id"]}">📅</button> <button class="delete" data-section="negatives" data-row="{r["id"]}">🗑</button></div></td>')
        tbody.append(row_cells(r)); tbody.append('</tr>')

    def add_balance_row(label, key, danger=False):
        tbody.append(f'<tr><td class="sticky">{label}</td>')
        if not collapse or gran=="WEEK":
            for p in periods:
                for wid in p["weeks"]:
                    val = totals[wid][key]
                    cls = "danger danger-bg" if (danger and val < eop_threshold) else ""
                    tbody.append(f'<td class="{cls}">{fmt_eur(val)}</td>')
        else:
            for p in periods:
                if key=="bop":
                    wid = p["weeks"][0]
                    tbody.append(f'<td>{fmt_eur(totals[wid]["bop"])}</td>')
                elif key=="eop":
                    wid = p["weeks"][-1]
                    val = totals[wid]["eop"]; cls = "danger danger-bg" if (danger and val < eop_threshold) else ""
                    tbody.append(f'<td class="{cls}">{fmt_eur(val)}</td>')
                elif key=="net":
                    s = sum(totals[wid]["net"] for wid in p["weeks"])
                    tbody.append(f'<td>{fmt_eur(s)}</td>')
        tbody.append('</tr>')

    tbody.append(f'<tr class="section balances"><td class="sticky">Balances</td>{"".join("<td></td>" for _ in range(sum(len(p["weeks"]) for p in periods) if not collapse or gran=="WEEK" else len(periods)))}</tr>')
    add_balance_row("BoP","bop")
    add_balance_row("Net Flow","net")
    add_balance_row("EoP","eop", danger=True)

    tbody.append('</tbody>')
    table = '<div class="panel"><table id="grid">' + "".join(thead) + "".join(tbody) + '</table></div>'
    return cards + table
