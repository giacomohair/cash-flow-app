// ===== Utilities =====
const uid=()=>Math.random().toString(36).slice(2,10);
const addDays=(d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x};
const startOfWeek=(d)=>{const x=new Date(d); const w=(x.getDay()+6)%7; x.setDate(x.getDate()-w); x.setHours(0,0,0,0); return x}; // Monday
const endOfWeek=(d)=>{const s=startOfWeek(d); return addDays(s,6)}; // Sunday
const iso=d=>{const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10)};
const nextMonday=(d)=>{const x=new Date(d);const w=x.getDay();const a=(8-(w||7))%7; x.setDate(x.getDate()+a); x.setHours(0,0,0,0); return x};
const fmt=(n)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);

// ===== Model =====
function makeWeeks(n=26, startDate=null){
  const start = startDate? startOfWeek(new Date(startDate)) : nextMonday(new Date());
  return Array.from({length:n},(_,i)=>{ const s=addDays(start, i*7); return {id:uid(), start: iso(s), end: iso(addDays(s,6))} });
}
function weeksFromDates(startDateISO, endDateISO){
  const s = startOfWeek(new Date(startDateISO));
  const e = endOfWeek(new Date(endDateISO));
  const weeks=[];
  for(let cur=new Date(s); cur<=e; cur=addDays(cur,7)){
    weeks.push({id:uid(), start: iso(cur), end: iso(addDays(cur,6))});
  }
  return weeks;
}
function zero(weeks){ return Object.fromEntries(weeks.map(w=>[w.id,0])) }
function demo(withDates=null){
  let weeks = withDates ? weeksFromDates(withDates.start, withDates.end) : makeWeeks(26);
  const z=zero(weeks);
  const positives=[
    {id:uid(),name:'Salary',type:'INFLOW',recur:{kind:'WEEKLY',every:1,amount:2000},values:{...z}},
    {id:uid(),name:'Bonus',type:'INFLOW',recur:{kind:'CUSTOM',every:13,amount:1000},values:{...z}},
  ];
  const negatives=[
    {id:uid(),name:'Mortgage',type:'OUTFLOW',recur:{kind:'MONTHLY',every:1,amount:-1200},values:{...z}},
    {id:uid(),name:'Kindergarten',type:'OUTFLOW',recur:{kind:'WEEKLY',every:1,amount:-200},values:{...z}},
    {id:uid(),name:'Groceries',type:'OUTFLOW',recur:{kind:'WEEKLY',every:1,amount:-150},values:{...z}},
    {id:uid(),name:'Netflix',type:'OUTFLOW',recur:{kind:'MONTHLY',every:1,amount:-15},values:{...z}},
    {id:uid(),name:'Credit card',type:'OUTFLOW',isCard:true,recur:{kind:'MONTHLY',every:1,amount:-300},values:{...z}},
    {id:uid(),name:'Savings',type:'OUTFLOW',recur:{kind:'WEEKLY',every:1,amount:-100},locked:true,values:{...z}},
    {id:uid(),name:'Adjustment',type:'OUTFLOW',values:{...z},isAdjustment:true},
  ];
  return {bop0:1500,weeks,positives,negatives};
}
// Modello vuoto per i nuovi utenti: orizzonte di default ma nessuna voce.
// Mantiene solo le righe strutturali del data model: Savings (locked) e Adjustment, vuote.
function emptyModel(withDates=null){
  let weeks = withDates ? weeksFromDates(withDates.start, withDates.end) : makeWeeks(26);
  const z=zero(weeks);
  const positives=[];
  const negatives=[
    {id:uid(),name:'Savings',type:'OUTFLOW',locked:true,values:{...z}},
    {id:uid(),name:'Adjustment',type:'OUTFLOW',values:{...z},isAdjustment:true},
  ];
  return {bop0:0,weeks,positives,negatives};
}
function isMonthlyHit(weekStartISO, anchorISO){
  const w=new Date(weekStartISO), anchor=new Date(anchorISO);
  for(let d=0; d<7; d++){ const cur=addDays(w,d); if(cur.getDate()===anchor.getDate()) return true }
  return false;
}
function materialize(model){
  if(!model.weeks.length) return;
  const anchor=model.weeks[0].start;
  const apply=row=>{
    const r=row.recur; if(!r) return; const amt=Number(r.amount||0);
    model.weeks.forEach((w,i)=>{ const cur=row.values[w.id]; if(Number(cur)) return;
      if(r.kind==='WEEKLY') row.values[w.id]=amt;
      else if(r.kind==='BIWEEKLY') row.values[w.id]=(i%2===0?amt:0);
      else if(r.kind==='MONTHLY') row.values[w.id]=isMonthlyHit(w.start,anchor)?amt:0;
      else if(r.kind==='CUSTOM'){ const n=Number(r.every||1); row.values[w.id]=(i%n===0?amt:0) }
    });
  };
  model.positives.forEach(apply); model.negatives.forEach(apply);
}
function totalsByWeek(model){
  const totals={}; let run=0;
  const sav=model.negatives.find(r=>(r.name||'').toLowerCase()==='savings');
  model.weeks.forEach((w,i)=>{
    const pos=model.positives.reduce((a,r)=>a+Number(r.values[w.id]||0),0);
    const neg=model.negatives.reduce((a,r)=>a+Number(r.values[w.id]||0),0);
    const net=pos+neg;
    const bop=(i===0)? Number(model.bop0||0) : totals[model.weeks[i-1].id].eop;
    const eop=bop+net;
    const sVal=sav?Number(sav.values[w.id]||0):0; run+=(sVal<0?-sVal:sVal);
    totals[w.id]={pos,neg,net,bop,eop,runSav:run};
  }); return totals;
}

// ===== Grouping =====
function monthKey(d){ const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}` }
function monthLabel(k){ const [y,m]=k.split('-'); const dt=new Date(Number(y), Number(m)-1, 1); return dt.toLocaleString(undefined,{month:'short', year:'2-digit'}) }
function quarterKey(d){ const x=new Date(d); const q=Math.floor(x.getMonth()/3)+1; return `${x.getFullYear()}-Q${q}` }
function yearKey(d){ const x=new Date(d); return `${x.getFullYear()}` }

function buildPeriods(model, gran){
  const map=new Map();
  if(gran==='WEEK'){
    model.weeks.forEach(w=>{
      const id=w.id; map.set(id,{id, label:new Date(w.start).toLocaleDateString(undefined,{month:'short',day:'numeric'}), weeks:[w.id]});
    });
  } else if(gran==='MONTH'){
    model.weeks.forEach(w=>{
      const k=monthKey(w.start);
      if(!map.has(k)) map.set(k,{id:k,label:monthLabel(k),weeks:[]});
      map.get(k).weeks.push(w.id);
    });
  } else if(gran==='QUARTER'){
    model.weeks.forEach(w=>{
      const k=quarterKey(w.start);
      if(!map.has(k)) map.set(k,{id:k,label:k,weeks:[]});
      map.get(k).weeks.push(w.id);
    });
  } else {
    model.weeks.forEach(w=>{
      const k=yearKey(w.start);
      if(!map.has(k)) map.set(k,{id:k,label:k,weeks:[]});
      map.get(k).weeks.push(w.id);
    });
  }
  return Array.from(map.values());
}

// ===== Persistence & State =====
// La persistenza è dietro storage.js (load/save async). Questi wrapper mantengono
// invariate le chiamate sincrone sparse nel codice (fire-and-forget per localStorage).
function save(m){ storage.save({ model: m }); }
function savePrefs(){ storage.save({ prefs: ui }); }
let model, ui; // assegnati in init() dopo storage.load()

// ===== DOM =====
const gridEl=document.getElementById('grid');
const cardRunSav=document.getElementById('cardRunSav');
const cardAlertCount=document.getElementById('cardAlertCount');
const cardAlertChips=document.getElementById('cardAlertChips');
const cardEop=document.getElementById('cardEop');

// Toolbar elements
const startInput=document.getElementById('startDate');
const endInput=document.getElementById('endDate');
const applyDatesBtn=document.getElementById('applyDatesBtn');
const granSel=document.getElementById('granSel');
const eopInput=document.getElementById('eopThreshold');
const collapseAllBtn=document.getElementById('collapseAllBtn');
const expandAllBtn=document.getElementById('expandAllBtn');
const plus3mBtn=document.getElementById('plus3mBtn');
const plus6mBtn=document.getElementById('plus6mBtn');
const addInflowBtn=document.getElementById('addInflowBtn');
const addOutflowBtn=document.getElementById('addOutflowBtn');
const addWeekBtn=document.getElementById('addWeekBtn');
const resetBtn=document.getElementById('resetBtn');

// Mobile
const mViewBtn=document.getElementById('mViewBtn');
const mViewLabel=document.getElementById('mViewLabel');
const mCollapseBtn=document.getElementById('mCollapseBtn');
const mAddWeekBtn=document.getElementById('mAddWeekBtn');
const mPlus3Btn=document.getElementById('mPlus3Btn');
const mResetBtn=document.getElementById('mResetBtn');

// Drawer
const drawer=document.getElementById('drawer');
document.getElementById('menuBtn').addEventListener('click', ()=> drawer.classList.add('show'));
document.getElementById('closeDrawer').addEventListener('click', ()=> drawer.classList.remove('show'));

// ===== Helpers =====
function toast(text){
  let msgEl=document.getElementById('msg');
  msgEl.textContent=text; msgEl.style.display='block'; setTimeout(()=>msgEl.style.display='none',2200);
}
function colSum(row, weekIds){ return weekIds.reduce((a,wid)=>a+Number(row.values[wid]||0),0) }
function weekLabelById(wid){
  const w = model.weeks.find(x=>x.id===wid); if(!w) return wid;
  const dt = new Date(w.start);
  return dt.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function breaches(tWeek, thr){
  const hits=[];
  for(const w of model.weeks){
    const e = tWeek[w.id].eop;
    if(e < thr){
      hits.push({wid:w.id, label: weekLabelById(w.id), eop:e});
    }
  }
  return hits;
}

// ===== Mini grafico temporale (SVG inline, nessuna dipendenza) =====
function niceStep(range, targetTicks=4){
  const raw = Math.max(range,1)/targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw/mag;
  const step = norm<1.5?1 : norm<3?2 : norm<7?5 : 10;
  return step*mag;
}
function chartSVG(values, weekLabels, opts={}){
  const { lineColor='#FF385C', threshold=null } = opts;
  const n = values.length;
  const W=640, H=220, padL=64, padR=14, padT=16, padB=26;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  if(!n) return `<svg viewBox="0 0 ${W} ${H}"></svg>`;
  const hasThr = threshold!=null && isFinite(threshold);
  const dataMin = Math.min(...values, hasThr?threshold:Infinity);
  const dataMax = Math.max(...values, hasThr?threshold:-Infinity);
  // Dominio: include SEMPRE lo zero; nessun padding negativo se non ci sono valori < 0.
  let lo0 = Math.min(0, dataMin), hi0 = Math.max(0, dataMax);
  if(hi0===lo0) hi0 = lo0 + 1;
  const step = niceStep(hi0-lo0);
  const lo = Math.floor(lo0/step)*step;
  let hi = Math.ceil(hi0/step)*step;
  if(hi===lo) hi += step;
  const X=i=> padL + (n<=1? innerW/2 : innerW*i/(n-1));
  const Y=v=> padT + innerH*(1-(v-lo)/(hi-lo));
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const zeroY = Y(0);
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">`;
  // Banda di allerta (sotto la soglia)
  if(hasThr){
    const ty=Y(threshold);
    const bandY=Math.max(padT, Math.min(ty, padT+innerH));
    const bandH=(padT+innerH)-bandY;
    if(bandH>0) s += `<rect x="${padL}" y="${bandY.toFixed(1)}" width="${innerW}" height="${bandH.toFixed(1)}" fill="#FFF1F0"/>`;
  }
  // Griglia + etichette Y a tacche "pulite" (lo zero è enfatizzato)
  for(let v=lo; v<=hi+1e-6; v+=step){
    const yy=Y(v); const isZero=Math.abs(v)<1e-6;
    s += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(padL+innerW)}" y2="${yy.toFixed(1)}" stroke="${isZero?'#9CA3AF':'#EEF0F3'}" stroke-width="${isZero?1.2:1}"/>`;
    s += `<text x="${padL-8}" y="${(yy+3).toFixed(1)}" text-anchor="end" font-size="10" fill="${isZero?'#374151':'#9CA3AF'}">${esc(fmt(v))}</text>`;
  }
  // Soglia di allerta (linea tratteggiata) + etichetta
  if(hasThr){
    const ty=Y(threshold);
    s += `<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${(padL+innerW)}" y2="${ty.toFixed(1)}" stroke="#D93025" stroke-width="1" stroke-dasharray="4 3"/>`;
    s += `<text x="${(padL+innerW)}" y="${(ty-4).toFixed(1)}" text-anchor="end" font-size="10" fill="#D93025">Alert ${esc(fmt(threshold))}</text>`;
  }
  // Area sfumata sotto la linea (fino alla base zero)
  const linePts = values.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  s += `<path d="M${X(0).toFixed(1)},${zeroY.toFixed(1)} L${linePts.join(' L')} L${X(n-1).toFixed(1)},${zeroY.toFixed(1)} Z" fill="${lineColor}" fill-opacity="0.08"/>`;
  // Linea
  s += `<polyline points="${linePts.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // Punti sotto soglia (rossi)
  if(hasThr){
    values.forEach((v,i)=>{ if(v<threshold) s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.2" fill="#D93025"/>`; });
  }
  // Etichette X (prima/ultima settimana)
  s += `<text x="${padL}" y="${H-8}" text-anchor="start" font-size="10" fill="#6B7280">${esc(weekLabels[0]||'')}</text>`;
  if(n>1) s += `<text x="${(padL+innerW)}" y="${H-8}" text-anchor="end" font-size="10" fill="#6B7280">${esc(weekLabels[n-1]||'')}</text>`;
  s += `</svg>`;
  return s;
}

// ===== Data input (inserimento rapido settimana per settimana, mobile-friendly) =====
let diWeekId = null;
function currentWeekId(){
  const today = iso(new Date());
  const w = model.weeks.find(w => today>=w.start && today<=w.end);
  return w ? w.id : (model.weeks[0] ? model.weeks[0].id : null);
}
function diRow(section, r, wid){
  const v = Number(r.values[wid]||0);
  const lockTag = r.locked ? ' <span class="tag">Locked</span>' : '';
  const del = (!r.locked && !r.isAdjustment)
    ? `<button class="iconbtn di-del" title="Remove this item" onclick="deleteRow('${section}','${r.id}')">🗑️</button>` : '';
  return `<div class="di-row">
    <label class="di-name">${r.name}${lockTag}</label>
    <span class="di-controls">
      <input class="di-input" type="number" inputmode="decimal" value="${v}" onblur="editCell('${section}','${r.id}','${wid}', this.value)">
      ${del}
    </span>
  </div>`;
}
function diCardRow(r, idx){
  // Settimane selezionabili: dalla corrente in poi; default ~4 settimane avanti.
  const future = model.weeks.slice(idx);
  const defK = Math.min(4, future.length-1);
  const wkOpts = future.map((ww,k)=>`<option value="${ww.id}" ${k===defK?'selected':''}>${new Date(ww.start).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</option>`).join('');
  const upcoming = future.filter(ww=>Number(r.values[ww.id]||0)!==0)
    .map(ww=>`${fmt(r.values[ww.id])} on ${new Date(ww.start).toLocaleDateString(undefined,{day:'numeric',month:'short'})}`);
  const del = `<button class="iconbtn di-del" title="Remove this card" onclick="deleteRow('negatives','${r.id}')">🗑️</button>`;
  return `<div class="di-card">
    <div class="di-card-head"><span class="di-name">${r.name}</span>${del}</div>
    <div class="di-card-form">
      <input id="cardAmt_${r.id}" class="di-input" type="number" inputmode="decimal" placeholder="amount">
      <span class="di-card-when">charged</span>
      <select id="cardWk_${r.id}" class="di-cardwk">${wkOpts}</select>
      <button class="ghost" onclick="postCard('${r.id}')">Post</button>
    </div>
    <div class="di-hint">${upcoming.length ? 'Scheduled: '+upcoming.join(' · ') : 'No charge scheduled yet.'}</div>
  </div>`;
}
function postCard(cardId){
  const amtEl = document.getElementById('cardAmt_'+cardId);
  const wkEl  = document.getElementById('cardWk_'+cardId);
  const card  = model.negatives.find(r=>r.id===cardId);
  if(!card || !amtEl || !wkEl) return;
  const wid = wkEl.value; if(!wid) return;
  const amt = Math.abs(Number(amtEl.value||0));
  card.values[wid] = -amt;   // imposta il pagamento previsto in quella settimana (sovrascrive)
  materialize(model); save(model); render();
}
function renderDataInput(tWeek){
  const el = document.getElementById('dataInput'); if(!el) return;
  if(!model.weeks.length){ el.innerHTML = '<p style="opacity:.7">No weeks in the current horizon. Set a date range in Dashboard.</p>'; return; }
  if(!diWeekId || !model.weeks.some(w=>w.id===diWeekId)) diWeekId = currentWeekId();
  const idx = model.weeks.findIndex(w=>w.id===diWeekId);
  const w = model.weeks[idx];
  const t = tWeek[w.id];
  const dLabel = new Date(w.start).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  // Solo voci NON ricorrenti: le ricorrenti si gestiscono nella vista cash-flow estesa.
  const inc = model.positives.filter(r=>!r.recur);
  const exp = model.negatives.filter(r=>!r.isAdjustment && !r.isCard && !r.recur);
  const cards = model.negatives.filter(r=>r.isCard);
  let h = '';
  h += `<div class="di-nav">
    <button class="ghost" onclick="diStep(-1)" ${idx<=0?'disabled':''}>‹ Prev</button>
    <div class="di-week"><div class="di-week-top">Week of</div><div class="di-week-date">${dLabel}</div></div>
    <button class="ghost" onclick="diStep(1)" ${idx>=model.weeks.length-1?'disabled':''}>Next ›</button>
  </div>`;
  h += `<div class="di-summary">
    <span>BoP<b>${fmt(t.bop)}</b></span>
    <span>Net<b>${fmt(t.net)}</b></span>
    <span>EoP<b>${fmt(t.eop)}</b></span>
  </div>`;
  h += `<div class="di-note">Showing one-off items only. Recurring items (e.g. Salary, Rent) update automatically — manage them in “Cash-flow view and full data input”. The summary above still reflects the full week.</div>`;
  h += `<div class="di-group"><div class="di-group-title">Income (one-off)</div>`;
  h += inc.length ? inc.map(r=>diRow('positives', r, w.id)).join('') : `<div class="di-empty">No one-off income this week.</div>`;
  h += `<button class="ghost di-add" onclick="openItemModal({mode:'add',type:'INFLOW'})">+ Add income</button>`;
  h += `</div>`;
  h += `<div class="di-group"><div class="di-group-title">Expenses (one-off)</div>`;
  h += exp.length ? exp.map(r=>diRow('negatives', r, w.id)).join('') : `<div class="di-empty">No one-off expenses this week.</div>`;
  h += `<button class="ghost di-add" onclick="openItemModal({mode:'add',type:'OUTFLOW'})">+ Add expense</button>`;
  h += `</div>`;
  h += `<div class="di-group"><div class="di-group-title">Credit cards</div>`;
  h += `<div class="di-hint" style="margin-top:0;margin-bottom:8px">A card charge hits your cash on its payment week. Enter the amount and pick the week it will be debited.</div>`;
  h += cards.length ? cards.map(r=>diCardRow(r, idx)).join('') : `<div class="di-empty">No credit cards yet.</div>`;
  h += `<button class="ghost di-add" onclick="openItemModal({mode:'add',type:'OUTFLOW',card:true})">+ Add credit card</button>`;
  h += `</div>`;
  h += `<div class="di-group"><div class="di-group-title">Actual cash at end of week</div>
    <div class="di-eoprow">
      <label class="di-name">Actual cash now (EoP)</label>
      <input class="di-input di-eop" type="number" inputmode="decimal" value="${t.eop}" onblur="editEop('${w.id}', this.value)">
    </div>
    <div class="di-hint">Typing here adjusts the Adjustment row so the balance matches your real cash.</div>
  </div>`;
  el.innerHTML = h;
}
function diStep(delta){
  const i = model.weeks.findIndex(w=>w.id===diWeekId);
  const j = i + delta;
  if(j>=0 && j<model.weeks.length){ diWeekId = model.weeks[j].id; render(); }
}

// ===== Render =====
function render(){
  const tWeek = totalsByWeek(model);
  const periods = buildPeriods(model, ui.gran);
  const eopLast = model.weeks.length? tWeek[model.weeks[model.weeks.length-1].id].eop : 0;
  const runSavLast = model.weeks.length? tWeek[model.weeks[model.weeks.length-1].id].runSav : 0;
  const thr = Number(ui.eopThreshold||0);
  const hitWeeks = breaches(tWeek, thr);

  // Cards
  cardEop.textContent = fmt(eopLast);
  cardRunSav.textContent = fmt(runSavLast);
  cardAlertCount.textContent = hitWeeks.length ? String(hitWeeks.length) : '0';
  cardAlertCount.className = hitWeeks.length ? 'big bad' : 'big';
  cardAlertChips.innerHTML = hitWeeks.slice(0,8).map(h=>`<span class="chip">${h.label}</span>`).join('') + (hitWeeks.length>8? `<span class="chip">+${hitWeeks.length-8} more</span>`:'');

  // Charts (Dashboard): andamento temporale di EoP (cassa) e Running Savings
  const wkLabels = model.weeks.map(w=>weekLabelById(w.id));
  const eopSeries = model.weeks.map(w=>tWeek[w.id].eop);
  const savSeries = model.weeks.map(w=>tWeek[w.id].runSav);
  const eopChartEl = document.getElementById('eopChart');
  const savChartEl = document.getElementById('savChart');
  if(eopChartEl) eopChartEl.innerHTML = chartSVG(eopSeries, wkLabels, {lineColor:'#0F172A', threshold:thr});
  if(savChartEl) savChartEl.innerHTML = chartSVG(savSeries, wkLabels, {lineColor:'#0f766e'});

  // Data input view (week-by-week)
  renderDataInput(tWeek);

  // Table
  let html = "";
  // THEAD
  html += '<thead>';
  html += '<tr class="periods">';
  html += '<th class="sticky">Item / Period</th>';
  for(const p of periods){
    const collapsed = !!ui.collapsed[p.id];
    const span = collapsed? 1 : p.weeks.length;
    html += `<th colspan="${span}"><span class="toggle" onclick="togglePeriod('${p.id}')">${collapsed?'▶':'▼'}</span> ${p.label}</th>`;
  }
  html += '</tr>';

  html += '<tr class="weeks">';
  html += '<th class="sticky"></th>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      html += `<th>Σ</th>`;
    } else {
      for(const wid of p.weeks){
        const lbl = weekLabelById(wid);
        html += `<th>${lbl}</th>`;
      }
    }
  }
  html += '</tr>';
  html += '</thead>';

  // TBODY
  html += '<tbody>';
  html += `<tr class="section inflows"><td class="sticky">Inflows</td>${periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('')}</tr>`;
  for(const r of model.positives){
    html += `<tr class="inflow-row">`;
    html += `<td class="sticky"><div class="rowname"><span class="name">${r.name}</span> <button class="iconbtn" title="Recurrence" onclick="editRecurrence('positives','${r.id}')">📅</button> <button class="iconbtn" title="Delete" onclick="deleteRow('positives','${r.id}')">🗑️</button></div></td>`;
    for(const p of periods){
      if(ui.collapsed[p.id]){
        const agg = colSum(r, p.weeks);
        html += `<td class="agg-cell" title="Collapsed total — click ▶ on the period header to expand and enter weekly values"><input class="cell" type="number" value="${agg}" disabled></td>`;
      } else {
        for(const wid of p.weeks){
          const v = Number(r.values[wid]||0);
          html += `<td><input class="cell" type="number" inputmode="decimal" value="${v}" onblur="editCell('positives','${r.id}','${wid}', this.value)"></td>`;
        }
      }
    }
    html += '</tr>';
  }

  const emptyCells = periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('');
  const negRowHTML = (r, extra='')=>{
    const base = r.isAdjustment ? 'adjustment-row' : (r.isCard ? 'outflow-row card-row' : 'outflow-row');
    const trClass = extra ? base+' '+extra : base;
    let tagHTML = '';
    if(r.locked) tagHTML += `<span class="tag">Locked</span> `;
    if(r.isAdjustment){
      tagHTML += `<span class="tag">Adjustment</span> `;
    } else {
      // Natura dell'uscita: carta di credito / ricorrente / una tantum
      const cat = r.isCard ? {c:'tag--card', t:'Credit card'}
                : r.recur  ? {c:'tag--recurring', t:'Recurring'}
                :            {c:'tag--oneoff', t:'One-off'};
      tagHTML += `<span class="tag ${cat.c}">${cat.t}</span> `;
    }
    let row = `<tr class="${trClass}">`;
    row += `<td class="sticky"><div class="rowname"><span class="name">${r.name}</span> ${tagHTML}${(!r.isAdjustment && !r.locked) ? `<button class="iconbtn" title="Recurrence" onclick="editRecurrence('negatives','${r.id}')">📅</button> <button class="iconbtn" title="Delete" onclick="deleteRow('negatives','${r.id}')">🗑️</button>`:''}</div></td>`;
    for(const p of periods){
      if(ui.collapsed[p.id]){
        const agg = colSum(r, p.weeks);
        row += `<td class="agg-cell" title="Collapsed total — click ▶ on the period header to expand and enter weekly values"><input class="cell" type="number" value="${agg}" disabled></td>`;
      } else {
        for(const wid of p.weeks){
          const v = Number(r.values[wid]||0);
          if(r.isAdjustment){
            // L'Adjustment è guidato dalla riga EoP (back-solve): sola lettura.
            row += `<td><input class="cell" type="number" value="${v}" disabled title="Set automatically from the EoP row"></td>`;
          } else {
            row += `<td><input class="cell" type="number" inputmode="decimal" value="${v}" onblur="editCell('negatives','${r.id}','${wid}', this.value)"></td>`;
          }
        }
      }
    }
    row += '</tr>';
    return row;
  };

  html += `<tr class="section outflows"><td class="sticky">Outflows</td>${emptyCells}</tr>`;
  // Le carte restano Outflows (sfondo rossino + tag "Credit card"); un riquadro leggero
  // racchiude l'intero gruppo, senza intestazione.
  const cardList = model.negatives.filter(r=>r.isCard);
  const firstCardId = cardList.length ? cardList[0].id : null;
  const lastCardId  = cardList.length ? cardList[cardList.length-1].id : null;
  for(const r of model.negatives){
    let extra = '';
    if(r.id===firstCardId) extra += ' card-row-first';
    if(r.id===lastCardId)  extra += ' card-row-last';
    html += negRowHTML(r, extra.trim());
  }

  // Totals
  const tWeek2 = totalsByWeek(model);
  const thr2 = Number(ui.eopThreshold||0);

  html += `<tr class="section balances"><td class="sticky">Balances</td>${periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('')}</tr>`;
  // BoP row
  html += '<tr><td class="sticky">BoP (Beginning of Period)</td>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      const firstWid = p.weeks[0];
      html += `<td>${fmt(tWeek2[firstWid].bop)}</td>`;
    } else {
      for(const wid of p.weeks){
        html += `<td>${fmt(tWeek2[wid].bop)}</td>`;
      }
    }
  }
  html += '</tr>';
  // Net row
  html += '<tr><td class="sticky">Net Flow</td>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      const sum = p.weeks.reduce((a,wid)=>a + tWeek2[wid].net, 0);
      html += `<td>${fmt(sum)}</td>`;
    } else {
      for(const wid of p.weeks){
        html += `<td>${fmt(tWeek2[wid].net)}</td>`;
      }
    }
  }
  html += '</tr>';
  // EoP row: editable per-week (type the actual end-of-period cash -> back-solve Adjustment).
  // Aggregated (collapsed) periods stay read-only.
  html += '<tr><td class="sticky">EoP (End of Period)</td>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      const lastWid = p.weeks[p.weeks.length-1];
      const eop = tWeek2[lastWid].eop;
      const cls = (eop < thr2) ? 'danger danger-bg' : '';
      html += `<td class="${cls}">${fmt(eop)}</td>`;
    } else {
      for(const wid of p.weeks){
        const eop = tWeek2[wid].eop;
        const tdCls = (eop < thr2) ? 'danger-bg' : '';
        const inCls = (eop < thr2) ? 'danger' : '';
        html += `<td class="${tdCls}"><input class="cell eop-cell ${inCls}" type="number" inputmode="decimal" value="${eop}" onblur="editEop('${wid}', this.value)" title="Type the actual end-of-period cash; the Adjustment row is recomputed"></td>`;
      }
    }
  }
  html += '</tr>';
  // Running Savings
  html += '<tr><td class="sticky" style="color:#0f766e;font-weight:600">Running Savings</td>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      const lastWid = p.weeks[p.weeks.length-1]; html += `<td>${fmt(tWeek2[lastWid].runSav)}</td>`;
    } else {
      for(const wid of p.weeks){ html += `<td>${fmt(tWeek2[wid].runSav)}</td>`; }
    }
  }
  html += '</tr>';

  html += '</tbody>';
  gridEl.innerHTML = html;
}

// ===== Handlers =====
function editCell(section,rowId,weekId,raw){
  const group = model[section];
  const row = group.find(r=>r.id===rowId); if(!row) return;
  let v = Number(raw||0);
  if(row.type==='OUTFLOW' && v>0) v = -v; // auto-negative for outflows
  row.values[weekId] = v;
  materialize(model); save(model); render();
}
// EoP effettivo: l'utente digita la cassa reale di fine settimana e si calcola a
// ritroso la riga Adjustment (vedi decisione Fase 0). EOP resta calcolato (bop+net);
// cambia solo Adjustment, il data model è preservato.
function editEop(weekId, raw){
  const adj = model.negatives.find(r=>r.isAdjustment); if(!adj) return;
  const t = totalsByWeek(model)[weekId]; if(!t) return;
  const adjVal = Number(adj.values[weekId]||0);
  const netExclAdj = t.net - adjVal;            // net della settimana ESCLUSO Adjustment
  const target = Number(raw||0);
  adj.values[weekId] = target - t.bop - netExclAdj;  // bop(i)=eop(i-1), invariato da questa modifica
  materialize(model); save(model); render();
}
function deleteRow(section,rowId){
  const group = model[section];
  const row = group.find(r=>r.id===rowId);
  if(!row || row.locked || row.isAdjustment) return;
  const idx = group.findIndex(r=>r.id===rowId); group.splice(idx,1);
  save(model); render();
}
function editRecurrence(section,rowId){
  const row = model[section].find(r=>r.id===rowId); if(!row) return;
  openItemModal({ mode:'recur', section, rowId, type: row.type });
}

// ===== Info modal (hamburger menu entries) =====
const infoModal      = document.getElementById('infoModal');
const infoModalTitle = document.getElementById('infoModalTitle');
const infoModalBody  = document.getElementById('infoModalBody');
function showInfo(title, body){
  infoModalTitle.textContent = title;
  infoModalBody.textContent = body;
  drawer.classList.remove('show');     // chiudi il menu così il modale è visibile
  infoModal.classList.add('show');
}
function closeInfoModal(){ infoModal.classList.remove('show'); }
document.getElementById('infoModalOk').addEventListener('click', closeInfoModal);
document.getElementById('infoModalOverlay').addEventListener('click', closeInfoModal);
document.getElementById('menuPersonalArea').addEventListener('click', e=>{ e.preventDefault(); showInfo('Personal Area', 'Coming soon — profile, linked banks and more.'); });
document.getElementById('menuSettings').addEventListener('click', e=>{ e.preventDefault(); showInfo('Settings', 'Coming soon. App settings live here, while the table options are in the “Settings” panel inside “Cash-flow view and full data input”.'); });
// How-to guide modal
const howtoModal = document.getElementById('howtoModal');
function openHowto(){ drawer.classList.remove('show'); howtoModal.classList.add('show'); }
function closeHowto(){ howtoModal.classList.remove('show'); }
document.getElementById('howtoOk').addEventListener('click', closeHowto);
document.getElementById('howtoOverlay').addEventListener('click', closeHowto);
document.getElementById('menuHelp').addEventListener('click', e=>{ e.preventDefault(); openHowto(); });
document.getElementById('headerHelpBtn').addEventListener('click', openHowto);

// Drawer & period controls
function togglePeriod(pid){ ui.collapsed[pid] = !ui.collapsed[pid]; savePrefs(); render() }
function collapseAll(){ const periods=buildPeriods(model, ui.gran); ui.collapsed={}; periods.forEach(p=>ui.collapsed[p.id]=true); savePrefs(); render() }
function expandAll(){ ui.collapsed={}; savePrefs(); render() }

// Horizon buttons
function addWeek(){
  const last=model.weeks[model.weeks.length-1];
  const start=iso(addDays(new Date(last.end),1)); const end=iso(addDays(new Date(start),6));
  const w={id:uid(), start, end}; model.weeks.push(w);
  model.positives.forEach(r=>r.values[w.id]=0); model.negatives.forEach(r=>r.values[w.id]=0);
  materialize(model); save(model); render();
}

// Bind view navigation (Dashboard / Full cash-flow view / Settings)
const VIEWS = ['dashboard','full','datainput'];
function setView(view){
  if(!VIEWS.includes(view)) view = 'dashboard';
  for(const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.getAttribute('data-view')===view));
  for(const v of VIEWS) document.body.classList.toggle('view-'+v, v===view);
}
document.getElementById('tablist').addEventListener('click', (e)=>{
  if(!(e.target instanceof HTMLElement)) return;
  const b = e.target.closest('.tab'); if(!b) return;
  const view = b.getAttribute('data-view'); if(!view) return;
  setView(view);
  ui.activeView = view; savePrefs();
});

// Settings panel toggle (sulla riga delle date, nella vista tabella)
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
settingsToggle.addEventListener('click', ()=>{
  const open = settingsPanel.classList.toggle('open');
  settingsToggle.setAttribute('aria-expanded', String(open));
  settingsToggle.textContent = open ? '⚙️ Settings ▴' : '⚙️ Settings ▾';
});

// Dates actions
applyDatesBtn.addEventListener('click', ()=>{
  const s = startInput.value; const e = endInput.value;
  if(!s || !e){ toast('Pick both start and end dates.'); return; }
  const sDate=new Date(s), eDate=new Date(e);
  if(eDate < sDate){ toast('End date must be after start date.'); return; }
  const newWeeks = weeksFromDates(s, e);
  const remapRow=(row)=>{
    const newVals = Object.fromEntries(newWeeks.map(w=>[w.id,0]));
    row.values = newVals; return row;
  };
  model.weeks = newWeeks;
  model.positives = model.positives.map(remapRow);
  model.negatives = model.negatives.map(remapRow);
  materialize(model); save(model);
  ui.collapsed={}; savePrefs();
  toast('Horizon updated to custom dates.');
  render();
});

// View actions
granSel.addEventListener('change', ()=>{ ui.gran=granSel.value; ui.collapsed={}; savePrefs(); mViewLabel.textContent = (ui.gran==='WEEK'?'Weeks':ui.gran==='MONTH'?'Months':ui.gran==='QUARTER'?'Quarters':'Years'); render() });
collapseAllBtn.addEventListener('click', collapseAll);
expandAllBtn.addEventListener('click', expandAll);

// Horizon actions
addWeekBtn.addEventListener('click', addWeek);
plus3mBtn.addEventListener('click', ()=>{ for(let i=0;i<13;i++) addWeek() });
plus6mBtn.addEventListener('click', ()=>{ for(let i=0;i<26;i++) addWeek() });

// Items actions (aprono il modale invece dei prompt nativi)
addInflowBtn.addEventListener('click', ()=> openItemModal({mode:'add', type:'INFLOW'}));
addOutflowBtn.addEventListener('click', ()=> openItemModal({mode:'add', type:'OUTFLOW'}));

// Alerts actions
eopInput.addEventListener('change', ()=>{ ui.eopThreshold = Number(eopInput.value||0); savePrefs(); render() });

// Reset
resetBtn.addEventListener('click', ()=>{ if(confirm('Replace current data with demo?')){ model=demo(); materialize(model); save(model); startInput.value=model.weeks[0].start; endInput.value=model.weeks[model.weeks.length-1].end; render() } });

// Mobile quick actions
mViewBtn.addEventListener('click', ()=>{
  const order=['WEEK','MONTH','QUARTER','YEAR'];
  const idx=order.indexOf(ui.gran); const next=order[(idx+1)%order.length];
  ui.gran=next; savePrefs();
  mViewLabel.textContent = (next==='WEEK'?'Weeks':next==='MONTH'?'Months':next==='QUARTER'?'Quarters':'Years');
  render();
});
mCollapseBtn.addEventListener('click', ()=>{
  const anyOpen = Object.values(ui.collapsed).some(v=>!v);
  if(anyOpen){ collapseAll() } else { expandAll() }
});
mAddWeekBtn.addEventListener('click', ()=> addWeek());
mPlus3Btn.addEventListener('click', ()=>{ for(let i=0;i<13;i++) addWeek() });
mResetBtn.addEventListener('click', ()=>{ if(confirm('Replace current data with demo?')){ model=demo(); materialize(model); save(model); startInput.value=model.weeks[0].start; endInput.value=model.weeks[model.weeks.length-1].end; render() } });

// ===== Modale "voce" (aggiunta / ricorrenza) =====
const itemModal      = document.getElementById('itemModal');
const itemModalTitle = document.getElementById('itemModalTitle');
const itemNameField  = document.getElementById('itemNameField');
const itemName       = document.getElementById('itemName');
const itemRecurring  = document.getElementById('itemRecurring');
const recurFields    = document.getElementById('recurFields');
const itemAmount     = document.getElementById('itemAmount');
const itemFreq       = document.getElementById('itemFreq');
const everyField     = document.getElementById('everyField');
const itemEvery      = document.getElementById('itemEvery');
const recurHint      = document.getElementById('recurHint');
const itemCardField  = document.getElementById('itemCardField');
const itemCard       = document.getElementById('itemCard');

let modalCtx = null; // { mode:'add'|'recur', type, section?, rowId?, card? }

function updateRecurUI(){
  recurFields.style.display = itemRecurring.checked ? '' : 'none';
  everyField.style.display  = (itemRecurring.checked && itemFreq.value==='CUSTOM') ? '' : 'none';
  if(itemRecurring.checked){
    const n = Math.max(1, Number(itemEvery.value||1));
    const map = { WEEKLY:'every week', BIWEEKLY:'every 2 weeks', MONTHLY:'every month', CUSTOM:`every ${n} week${n===1?'':'s'}` };
    recurHint.textContent = `It will be added automatically ${map[itemFreq.value]||''}.`;
  } else {
    recurHint.textContent = 'No recurrence: the item starts empty — enter the weekly amounts by hand.';
  }
}
itemRecurring.addEventListener('change', updateRecurUI);
itemFreq.addEventListener('change', updateRecurUI);
itemEvery.addEventListener('input', updateRecurUI);

function openItemModal(ctx){
  modalCtx = ctx;
  if(ctx.mode==='add'){
    const isCardAdd = ctx.type==='OUTFLOW';
    itemModalTitle.textContent = ctx.card ? 'New credit card' : (ctx.type==='INFLOW' ? 'New inflow' : 'New outflow');
    itemNameField.style.display = '';
    itemName.value = '';
    itemCardField.style.display = isCardAdd ? '' : 'none'; // spunta carta solo per le uscite
    itemCard.checked = !!ctx.card;
    itemRecurring.checked = false;
    itemAmount.value = ctx.type==='INFLOW' ? '1000' : '50';
    itemFreq.value = 'WEEKLY';
    itemEvery.value = '4';
  } else { // 'recur'
    const row = model[ctx.section].find(r=>r.id===ctx.rowId);
    itemModalTitle.textContent = `Recurrence — ${row?.name || ''}`;
    itemNameField.style.display = 'none';
    itemCardField.style.display = 'none';
    itemRecurring.checked = !!row?.recur;
    itemAmount.value = Math.abs(Number(row?.recur?.amount ?? (ctx.type==='INFLOW'?1000:50)));
    itemFreq.value = row?.recur?.kind || 'WEEKLY';
    itemEvery.value = row?.recur?.every || 4;
  }
  updateRecurUI();
  itemModal.classList.add('show');
  setTimeout(()=>{ (ctx.mode==='add' ? itemName : itemAmount).focus(); }, 50);
}
function closeItemModal(){ itemModal.classList.remove('show'); modalCtx = null; }

function buildRecur(type){
  const kind = itemFreq.value;
  const every = kind==='CUSTOM' ? Math.max(1, Number(itemEvery.value||1)) : 1;
  let amount = Math.abs(Number(itemAmount.value||0));
  if(type==='OUTFLOW') amount = -amount; // uscite negative (coerente con editCell)
  return { kind, every, amount };
}

function saveItemModal(){
  if(!modalCtx) return;
  if(modalCtx.mode==='add'){
    const name = itemName.value.trim();
    if(!name){ itemName.focus(); return; }
    const type = modalCtx.type;
    const row = { id:uid(), name, type, values:Object.fromEntries(model.weeks.map(w=>[w.id,0])) };
    if(type==='OUTFLOW' && itemCard.checked) row.isCard = true;
    if(itemRecurring.checked) row.recur = buildRecur(type);
    if(type==='INFLOW'){
      model.positives.push(row);
    } else {
      const adjIdx = model.negatives.findIndex(r=>r.isAdjustment);
      if(adjIdx>=0) model.negatives.splice(adjIdx,0,row); else model.negatives.push(row);
    }
  } else { // 'recur'
    const row = model[modalCtx.section].find(r=>r.id===modalCtx.rowId);
    if(!row){ closeItemModal(); return; }
    if(itemRecurring.checked) row.recur = buildRecur(row.type);
    else delete row.recur;
  }
  materialize(model); save(model); render();
  closeItemModal();
}

document.getElementById('itemCancel').addEventListener('click', closeItemModal);
document.getElementById('itemModalOverlay').addEventListener('click', closeItemModal);
document.getElementById('itemSave').addEventListener('click', saveItemModal);
// Invio per confermare, Esc per annullare
[itemName, itemAmount, itemEvery].forEach(el=> el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); saveItemModal(); } }));
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  if(itemModal.classList.contains('show')) closeItemModal();
  if(infoModal.classList.contains('show')) closeInfoModal();
  if(howtoModal.classList.contains('show')) closeHowto();
});

// Expose some funcs for inline handlers
window.togglePeriod = togglePeriod;
window.editCell = editCell;
window.editEop = editEop;
window.deleteRow = deleteRow;
window.diStep = diStep;
window.postCard = postCard;
window.editRecurrence = editRecurrence;
window.openItemModal = openItemModal;

// ===== Bootstrap (async: carica da storage, poi inizializza UI e render) =====
async function init(){
  const saved = await storage.load();
  model = saved.model || demo(); materialize(model); save(model);  // nuovi utenti: dati di esempio

  ui = saved.prefs || {gran:'MONTH',collapsed:{},eopThreshold:0,start:'',end:'',activeView:'dashboard'};
  if(!ui.gran) ui.gran='MONTH';
  if(!ui.collapsed) ui.collapsed={};
  if(typeof ui.eopThreshold!=='number') ui.eopThreshold=0;
  if(!ui.activeView) ui.activeView='dashboard';

  // Initialize inputs to current model horizon
  if(model.weeks.length){
    startInput.value = model.weeks[0].start;
    endInput.value = model.weeks[model.weeks.length-1].end;
  }
  granSel.value = ui.gran;
  eopInput.value = ui.eopThreshold;
  mViewLabel.textContent = (ui.gran==='WEEK'?'Weeks':ui.gran==='MONTH'?'Months':ui.gran==='QUARTER'?'Quarters':'Years');

  // Restore active view
  setView(ui.activeView || 'dashboard');

  // Initial render
  render();
}
// L'avvio è gestito da auth.js dopo l'autenticazione (Fase 2).
window.initApp = init;
