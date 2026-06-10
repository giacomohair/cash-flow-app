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
const granSeg=document.getElementById('granSeg');
const eopInput=document.getElementById('eopThreshold');
const plus3mBtn=document.getElementById('plus3mBtn');
const plus6mBtn=document.getElementById('plus6mBtn');
const addInflowBtn=document.getElementById('addInflowBtn');
const addOutflowBtn=document.getElementById('addOutflowBtn');
const addWeekBtn=document.getElementById('addWeekBtn');


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
  h += `<div class="di-note">Showing one-off items only. Recurring items (e.g. Salary, Rent) update automatically — manage them in the “Full view”. The summary above still reflects the full week.</div>`;
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

// ===== Insights: controlli deterministici (nessuna AI), organizzati per temi =====
const LVL_RANK = { danger:0, warn:1, info:2 };
const INS_THEMES = [
  { key:'data',     label:'🧹 Data hygiene' },
  { key:'health',   label:'📉 Financial health' },
  { key:'coverage', label:'🔭 Forecast coverage' },
];
function median(nums){
  if(!nums.length) return 0;
  const s = [...nums].sort((a,b)=>a-b); const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
function computeInsights(){
  const out = [];
  if(!model.weeks.length) return out;
  const tWeek = totalsByWeek(model);
  const thr = Number(ui.eopThreshold||0);
  const weeks = model.weeks;
  const months = buildPeriods(model, 'MONTH');

  // --- Financial health ---
  const neg = weeks.find(w => tWeek[w.id].eop < 0);
  if(neg) out.push({ theme:'health', level:'danger', icon:'🛑', title:'Cash goes negative', detail:`Around ${weekLabelById(neg.id)} your end-of-week cash drops below €0.`, view:'full' });

  const breach = weeks.filter(w => tWeek[w.id].eop < thr);
  if(breach.length) out.push({ theme:'health', level:'warn', icon:'⚠️', title:`${breach.length} week${breach.length>1?'s':''} below your alert`, detail:`First: ${weekLabelById(breach[0].id)} at ${fmt(tWeek[breach[0].id].eop)} (threshold ${fmt(thr)}).`, view:'dashboard' });

  // Spendi più di quanto entra nella maggioranza delle settimane
  const negNet = weeks.filter(w => tWeek[w.id].net < 0).length;
  if(weeks.length>=4 && negNet/weeks.length > 0.6) out.push({ theme:'health', level:'warn', icon:'📉', title:'You spend more than you earn', detail:`Net flow is negative in ${negNet} of ${weeks.length} weeks.`, view:'full' });

  // Trend di cassa in calo lungo l'orizzonte
  const startCash = tWeek[weeks[0].id].bop;
  const endCash = tWeek[weeks[weeks.length-1].id].eop;
  if(endCash < startCash) out.push({ theme:'health', level:'warn', icon:'↘️', title:'Cash is trending down', detail:`It falls ${fmt(startCash-endCash)} from start (${fmt(startCash)}) to end (${fmt(endCash)}) of the horizon.`, view:'dashboard' });

  // --- Data hygiene (per riga) ---
  const rows = [...model.positives, ...model.negatives.filter(r=>!r.isAdjustment)];
  for(const r of rows){
    const vals = weeks.map(w => Number(r.values[w.id]||0));
    const nonZero = vals.filter(v => v!==0);
    if(nonZero.length===0){ out.push({ theme:'data', level:'info', icon:'∅', title:`“${r.name}” is empty`, detail:'No amounts across the horizon — fill it in or remove it.', view:'full' }); continue; }
    if(r.type==='INFLOW' && vals.some(v=>v<0)) out.push({ theme:'data', level:'warn', icon:'±', title:`“${r.name}” has negative income`, detail:'An income week is negative — check the sign.', view:'full' });
    if(r.type==='OUTFLOW' && vals.some(v=>v>0)) out.push({ theme:'data', level:'warn', icon:'±', title:`“${r.name}” has a positive expense`, detail:'An expense week is positive — check the sign.', view:'full' });

    // Valore anomalo (outlier) rispetto alla mediana della riga
    if(nonZero.length>=3){
      const absVals = nonZero.map(Math.abs);
      const med = median(absVals);
      if(med>0){
        const out1 = absVals.find(v => v > med*4);
        if(out1!==undefined){ const wk = weeks.find(w=>Math.abs(Number(r.values[w.id]||0))===out1); out.push({ theme:'data', level:'warn', icon:'🔺', title:`“${r.name}” has an unusual amount`, detail:`${fmt(r.values[wk.id])} on ${weekLabelById(wk.id)} is far from its usual ${fmt(med)} — possible typo.`, view:'full' }); }
      }
    }

    // Voce NON ricorrente presente in molti mesi ma mancante in pochi (es. "Asilo")
    if(!r.recur && !r.isCard){
      const monthHas = months.map(p => ({ label:p.label, has: p.weeks.some(wid=>Number(r.values[wid]||0)!==0) }));
      const present = monthHas.filter(m=>m.has).length;
      const missing = monthHas.filter(m=>!m.has);
      if(present>=3 && missing.length>0 && missing.length <= Math.max(1, Math.floor(monthHas.length*0.34))){
        const miss = missing.map(m=>m.label).slice(0,3).join(', ');
        out.push({ theme:'data', level:'warn', icon:'🔎', title:`“${r.name}” may be missing in ${missing.length} month${missing.length>1?'s':''}`, detail:`Present in ${present} months but empty in ${miss}. Forgot to enter it?`, view:'full' });
      }
    }
  }

  // Nomi duplicati (entrate fra loro, uscite fra loro)
  const dupCheck = (list, what) => {
    const counts = {};
    list.forEach(r => { if(r.isAdjustment) return; const k=(r.name||'').trim().toLowerCase(); if(!k) return; counts[k]=(counts[k]||0)+1; });
    Object.keys(counts).filter(k=>counts[k]>1).forEach(k => out.push({ theme:'data', level:'info', icon:'⧉', title:`Duplicate ${what}`, detail:`“${k}” appears ${counts[k]} times — possible double entry.`, view:'full' }));
  };
  dupCheck(model.positives, 'income item');
  dupCheck(model.negatives, 'expense item');

  // --- Forecast coverage ---
  if(thr===0) out.push({ theme:'coverage', level:'info', icon:'🔔', title:'No alert threshold set', detail:'Set an EoP Alert (in Settings) to be warned about low-cash weeks.', view:'full' });

  return out;
}
function insCard(f){
  return `<div class="ins-card lvl-${f.level}">
    <span class="ins-ic">${f.icon}</span>
    <div class="ins-body"><div class="ins-title">${f.title}</div><div class="ins-detail">${f.detail}</div></div>
    <button class="ghost ins-go" onclick="gotoView('${f.view}')">Open →</button>
  </div>`;
}
function renderInsights(items){
  const el = document.getElementById('insights'); if(!el) return;
  const badge = document.getElementById('insightsBadge');
  if(badge){ if(items.length){ badge.textContent = String(items.length); badge.hidden = false; } else { badge.hidden = true; } }
  if(!items.length){
    el.innerHTML = `<h2 class="ins-h">Insights</h2><div class="ins-empty">✅ All good — no issues found in your numbers.</div>`;
    return;
  }
  let html = `<h2 class="ins-h">Insights</h2><p class="ins-sub">Automatic checks on your cash-flow, grouped by theme.</p>`;
  for(const t of INS_THEMES){
    const group = items.filter(f=>f.theme===t.key).sort((a,b)=> LVL_RANK[a.level]-LVL_RANK[b.level]);
    if(!group.length) continue;
    html += `<div class="ins-theme"><h3 class="ins-theme-h">${t.label}<span class="ins-count">${group.length}</span></h3>${group.map(insCard).join('')}</div>`;
  }
  el.innerHTML = html;
}
// Call-out flottanti (mostrati all'apertura): i findings più importanti.
function showCallouts(rawItems){
  const host = document.getElementById('callouts'); if(!host) return;
  host.innerHTML = '';
  const items = [...rawItems].sort((a,b)=> LVL_RANK[a.level]-LVL_RANK[b.level]); // più gravi prima
  items.slice(0,3).forEach((f,i)=>{
    const div = document.createElement('div');
    div.className = `callout lvl-${f.level}`;
    div.style.animationDelay = (i*90)+'ms';
    div.innerHTML = `<span class="co-ic">${f.icon}</span><div class="co-body"><div class="co-title">${f.title}</div><div class="co-detail">${f.detail}</div><button class="co-link" onclick="gotoView('insights')">View insights →</button></div><button class="co-x" aria-label="Dismiss">×</button>`;
    div.querySelector('.co-x').addEventListener('click', ()=> div.remove());
    setTimeout(()=>{ div.classList.add('leaving'); setTimeout(()=>div.remove(), 300); }, 9000 + i*600);
    host.appendChild(div);
  });
  if(items.length>3){
    const more = document.createElement('div');
    more.className = 'callout lvl-info co-more';
    more.innerHTML = `<div class="co-body"><button class="co-link" onclick="gotoView('insights')">+${items.length-3} more in Insights →</button></div>`;
    host.appendChild(more);
  }
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

  // Insights (controlli deterministici) — aggiorna pagina e badge tab
  renderInsights(computeInsights());

  // Table
  let html = "";
  // THEAD
  html += '<thead>';
  html += '<tr class="periods">';
  html += '<th class="sticky">Item / Period</th>';
  const togglable = ui.gran !== 'WEEK';  // alla granularità settimanale non c'è nulla da espandere
  for(const p of periods){
    const collapsed = !!ui.collapsed[p.id];
    const span = collapsed? 1 : p.weeks.length;
    if(togglable){
      html += `<th colspan="${span}" class="period-th" onclick="togglePeriod('${p.id}')" title="${collapsed?'Tap to expand into weeks':'Tap to collapse'}"><span class="chev">${collapsed?'▸':'▾'}</span> ${p.label}</th>`;
    } else {
      html += `<th colspan="${span}">${p.label}</th>`;
    }
  }
  html += '</tr>';

  // Seconda riga (date settimana) solo se serve: cioè quando un periodo raggruppato è
  // espanso, per etichettare le colonne-settimana. Niente riga duplicata a livello Week,
  // niente simboli Σ sotto i periodi compressi.
  const anyExpanded = togglable && periods.some(p=> !ui.collapsed[p.id] && p.weeks.length>1);
  if(anyExpanded){
    html += '<tr class="weeks">';
    html += '<th class="sticky"></th>';
    for(const p of periods){
      if(ui.collapsed[p.id]){
        html += `<th></th>`;
      } else {
        for(const wid of p.weeks){ html += `<th>${weekLabelById(wid)}</th>`; }
      }
    }
    html += '</tr>';
  }
  html += '</thead>';

  // TBODY
  html += '<tbody>';
  html += `<tr class="section inflows"><td class="sticky">Inflows</td>${periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('')}</tr>`;
  for(const r of model.positives){
    html += `<tr class="inflow-row">`;
    const inCat = r.recur ? {c:'tag--recurring', t:'Recurring'} : {c:'tag--oneoff', t:'One-off'};
    html += `<td class="sticky"><div class="rowname"><span class="name">${r.name}</span> <span class="tag ${inCat.c}">${inCat.t}</span> <button class="iconbtn" title="Recurrence" onclick="editRecurrence('positives','${r.id}')">📅</button> <button class="iconbtn" title="Delete" onclick="deleteRow('positives','${r.id}')">🗑️</button></div></td>`;
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
    let btns = '';
    if(!r.isAdjustment && !r.locked){
      // Le carte non sono ricorrenti: niente icona ricorrenza (calendario).
      if(!r.isCard) btns += `<button class="iconbtn" title="Recurrence" onclick="editRecurrence('negatives','${r.id}')">📅</button> `;
      btns += `<button class="iconbtn" title="Delete" onclick="deleteRow('negatives','${r.id}')">🗑️</button>`;
    }
    let row = `<tr class="${trClass}">`;
    row += `<td class="sticky"><div class="rowname"><span class="name">${r.name}</span> ${tagHTML}${btns}</div></td>`;
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
  askConfirm('Remove item', `Remove “${row.name}”? This can’t be undone.`, 'Delete', ()=> doDeleteRow(section, rowId));
}
function doDeleteRow(section,rowId){
  const group = model[section];
  const idx = group.findIndex(r=>r.id===rowId); if(idx<0) return;
  const row = group[idx]; if(row.locked || row.isAdjustment) return;
  group.splice(idx,1);
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

// ===== Confirm modal (azioni distruttive, es. cancellazione) =====
const confirmModal = document.getElementById('confirmModal');
const confirmTitle = document.getElementById('confirmTitle');
const confirmBody  = document.getElementById('confirmBody');
const confirmOkBtn = document.getElementById('confirmOk');
let confirmCb = null;
function askConfirm(title, body, okLabel, cb){
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOkBtn.textContent = okLabel || 'Confirm';
  confirmCb = cb;
  drawer.classList.remove('show');
  confirmModal.classList.add('show');
}
function closeConfirm(){ confirmModal.classList.remove('show'); confirmCb = null; }
confirmOkBtn.addEventListener('click', ()=>{ const cb = confirmCb; closeConfirm(); if(cb) cb(); });
document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
document.getElementById('confirmOverlay').addEventListener('click', closeConfirm);
document.getElementById('menuPersonalArea').addEventListener('click', e=>{ e.preventDefault(); showInfo('Personal Area', 'Coming soon — profile, linked banks and more.'); });
document.getElementById('menuSettings').addEventListener('click', e=>{ e.preventDefault(); showInfo('Settings', 'Coming soon. App settings live here, while the table options are in the “Settings” panel inside the “Full view”.'); });
// How-to guide modal
const howtoModal = document.getElementById('howtoModal');
function openHowto(){ drawer.classList.remove('show'); howtoModal.classList.add('show'); }
function closeHowto(){ howtoModal.classList.remove('show'); }
document.getElementById('howtoOk').addEventListener('click', closeHowto);
document.getElementById('howtoOverlay').addEventListener('click', closeHowto);
document.getElementById('menuHelp').addEventListener('click', e=>{ e.preventDefault(); openHowto(); });
document.getElementById('headerHelpBtn').addEventListener('click', openHowto);

// Tap su un'intestazione di periodo: espande/comprime quel periodo
function togglePeriod(pid){ ui.collapsed[pid] = !ui.collapsed[pid]; savePrefs(); render() }
// Imposta il livello di zoom (segmented control). Default sensato dei periodi:
// a livello settimana tutto espanso (celle editabili); a livelli superiori tutto
// compresso (overview a totali), poi si espande col tap.
function setGran(g){
  ui.gran = g;
  if(g==='WEEK'){
    ui.collapsed = {};
  } else {
    ui.collapsed = {};
    buildPeriods(model, g).forEach(p=> ui.collapsed[p.id] = true);
  }
  savePrefs();
  updateGranSeg();
  render();
}
function updateGranSeg(){
  for(const b of granSeg.querySelectorAll('.seg-btn')){
    b.setAttribute('aria-selected', String(b.getAttribute('data-gran')===ui.gran));
  }
}

// Horizon buttons
function addWeek(){
  const last=model.weeks[model.weeks.length-1];
  const start=iso(addDays(new Date(last.end),1)); const end=iso(addDays(new Date(start),6));
  const w={id:uid(), start, end}; model.weeks.push(w);
  model.positives.forEach(r=>r.values[w.id]=0); model.negatives.forEach(r=>r.values[w.id]=0);
  materialize(model); save(model); render();
}

// Bind view navigation (How to / Dashboard / Weekly data updates / Full view)
const VIEWS = ['howto','dashboard','insights','datainput','full'];
function setView(view){
  if(!VIEWS.includes(view)) view = 'howto';
  for(const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.getAttribute('data-view')===view));
  for(const v of VIEWS) document.body.classList.toggle('view-'+v, v===view);
}
function gotoView(view){ setView(view); window.scrollTo(0,0); }
document.getElementById('tablist').addEventListener('click', (e)=>{
  if(!(e.target instanceof HTMLElement)) return;
  const b = e.target.closest('.tab'); if(!b) return;
  const view = b.getAttribute('data-view'); if(!view) return;
  gotoView(view);
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

// View actions: segmented zoom level (Weeks/Months/Quarters/Years)
granSeg.addEventListener('click', (e)=>{
  const b = e.target.closest('.seg-btn'); if(!b) return;
  const g = b.getAttribute('data-gran'); if(!g || g===ui.gran) return;
  setGran(g);
});

// Horizon actions
addWeekBtn.addEventListener('click', addWeek);
plus3mBtn.addEventListener('click', ()=>{ for(let i=0;i<13;i++) addWeek() });
plus6mBtn.addEventListener('click', ()=>{ for(let i=0;i<26;i++) addWeek() });

// Items actions (aprono il modale invece dei prompt nativi)
addInflowBtn.addEventListener('click', ()=> openItemModal({mode:'add', type:'INFLOW'}));
addOutflowBtn.addEventListener('click', ()=> openItemModal({mode:'add', type:'OUTFLOW'}));

// Alerts actions
eopInput.addEventListener('change', ()=>{ ui.eopThreshold = Number(eopInput.value||0); savePrefs(); render() });

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
      const negs = model.negatives;
      if(row.isCard){
        // tieni le carte adiacenti: inserisci dopo l'ultima carta esistente
        let lastCard = -1;
        negs.forEach((r,i)=>{ if(r.isCard) lastCard = i; });
        if(lastCard>=0){ negs.splice(lastCard+1, 0, row); }
        else { const adjIdx = negs.findIndex(r=>r.isAdjustment); if(adjIdx>=0) negs.splice(adjIdx,0,row); else negs.push(row); }
      } else {
        const adjIdx = negs.findIndex(r=>r.isAdjustment);
        if(adjIdx>=0) negs.splice(adjIdx,0,row); else negs.push(row);
      }
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
  if(confirmModal.classList.contains('show')) closeConfirm();
});

// Expose some funcs for inline handlers
window.togglePeriod = togglePeriod;
window.gotoView = gotoView;
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

  ui = saved.prefs || {gran:'MONTH',collapsed:{},eopThreshold:0,start:'',end:'',seenHowto:false};
  if(!ui.gran) ui.gran='MONTH';
  if(!ui.collapsed) ui.collapsed={};
  if(typeof ui.eopThreshold!=='number') ui.eopThreshold=0;

  // Initialize inputs to current model horizon
  if(model.weeks.length){
    startInput.value = model.weeks[0].start;
    endInput.value = model.weeks[model.weeks.length-1].end;
  }
  updateGranSeg();
  eopInput.value = ui.eopThreshold;

  // Vista d'ingresso: la PRIMA volta "How to", poi sempre "Dashboard".
  let landing = 'dashboard';
  if(!ui.seenHowto){ landing = 'howto'; ui.seenHowto = true; savePrefs(); }
  setView(landing);

  // Initial render
  render();

  // Call-out flottanti all'apertura, se ci sono segnalazioni
  const findings = computeInsights();
  if(findings.length) setTimeout(()=> showCallouts(findings), 400);
}
// L'avvio è gestito da auth.js dopo l'autenticazione (Fase 2).
window.initApp = init;
