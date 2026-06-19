// ===== Utilities =====
const uid=()=>Math.random().toString(36).slice(2,10);
// Date "solo-giorno" robuste al fuso. PROBLEMA storico: new Date("YYYY-MM-DD") interpreta la
// stringa come UTC, e iso() la ri-serializzava in UTC → sfasamento di ±1 giorno (le settimane
// iniziavano di domenica). FIX: parsare le stringhe come MEZZANOTTE LOCALE e serializzare dai
// componenti locali. Tutte le conversioni stringa→Data passano da D().
const parseISO=s=>{ const p=String(s).split('-').map(Number); return new Date(p[0], (p[1]||1)-1, (p[2]||1)); };
const D=x=> (x instanceof Date) ? new Date(x) : (typeof x==='string' ? parseISO(x) : new Date(x));
const addDays=(d,n)=>{const x=D(d); x.setDate(x.getDate()+n); return x};
const startOfWeek=(d)=>{const x=D(d); const w=(x.getDay()+6)%7; x.setDate(x.getDate()-w); x.setHours(0,0,0,0); return x}; // Monday
const endOfWeek=(d)=>{const s=startOfWeek(d); return addDays(s,6)}; // Sunday
const iso=d=>{const x=D(d); const y=x.getFullYear(); const m=String(x.getMonth()+1).padStart(2,'0'); const dd=String(x.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`;};
const nextMonday=(d)=>{const x=D(d);const w=x.getDay();const a=(8-(w||7))%7; x.setDate(x.getDate()+a); x.setHours(0,0,0,0); return x};
const fmt=(n)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);

// ===== Model =====
function makeWeeks(n=26, startDate=null){
  const start = startDate? startOfWeek(startDate) : nextMonday(new Date());
  return Array.from({length:n},(_,i)=>{ const s=addDays(start, i*7); return {id:uid(), start: iso(s), end: iso(addDays(s,6))} });
}
function weeksFromDates(startDateISO, endDateISO){
  const s = startOfWeek(startDateISO);
  const e = endOfWeek(endDateISO);
  const weeks=[];
  for(let cur=new Date(s); cur<=e; cur=addDays(cur,7)){
    weeks.push({id:uid(), start: iso(cur), end: iso(addDays(cur,6))});
  }
  return weeks;
}
// Migrazione: riallinea al LUNEDÌ le settimane salvate con start non-lunedì (vecchio bug di
// fuso che le faceva iniziare di domenica). Gli id NON cambiano, quindi i valori restano
// agganciati per id; lo sfasamento era uniforme → la spaziatura di 7 giorni è preservata.
// No-op se tutte le settimane iniziano già di lunedì (es. dati puliti del preload).
function normalizeWeeksToMonday(m){
  if(!m || !Array.isArray(m.weeks)) return false;
  let changed=false;
  for(const w of m.weeks){
    const dow=D(w.start).getDay();          // 0=Dom .. 6=Sab (affidabile grazie a parseISO)
    if(dow===1) continue;                    // già lunedì
    let delta=(1-dow); if(delta<-3) delta+=7; if(delta>3) delta-=7;  // al lunedì più vicino
    const ns=addDays(w.start, delta);
    const nstart=iso(ns), nend=iso(addDays(ns,6));
    if(nstart!==w.start || nend!==w.end){ w.start=nstart; w.end=nend; changed=true; }
  }
  return changed;
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
const daysInMonth=(d)=> new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
// Vero se la settimana (Lun..Dom) contiene il "giorno del mese" scelto. Per i mesi più corti
// di quel giorno (es. il 31 a febbraio) si usa l'ultimo giorno del mese.
function isMonthlyHit(weekStartISO, day){
  const w=D(weekStartISO);
  for(let i=0;i<7;i++){ const cur=addDays(w,i); const eff=Math.min(day, daysInMonth(cur)); if(cur.getDate()===eff) return true; }
  return false;
}
function materialize(model){
  if(!model.weeks.length) return;
  const anchorDay = D(model.weeks[0].start).getDate();   // default per ricorrenze mensili senza "day"
  const apply=row=>{
    const r=row.recur; if(!r) return; const amt=Number(r.amount||0);
    const mday = (r.day!=null && Number(r.day)>=1) ? Number(r.day) : anchorDay;
    model.weeks.forEach((w,i)=>{ const cur=row.values[w.id]; if(Number(cur)) return;
      if(r.kind==='WEEKLY') row.values[w.id]=amt;
      else if(r.kind==='BIWEEKLY') row.values[w.id]=(i%2===0?amt:0);
      else if(r.kind==='MONTHLY') row.values[w.id]=isMonthlyHit(w.start, mday)?amt:0;
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
function monthKey(d){ const x=D(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}` }
function monthLabel(k){ const [y,m]=k.split('-'); const dt=new Date(Number(y), Number(m)-1, 1); return dt.toLocaleString(undefined,{month:'short', year:'2-digit'}) }
function quarterKey(d){ const x=D(d); const q=Math.floor(x.getMonth()/3)+1; return `${x.getFullYear()}-Q${q}` }
function yearKey(d){ const x=D(d); return `${x.getFullYear()}` }

function buildPeriods(model, gran){
  const map=new Map();
  if(gran==='WEEK'){
    model.weeks.forEach(w=>{
      const id=w.id; map.set(id,{id, label:D(w.start).toLocaleDateString(undefined,{month:'short',day:'numeric'}), weeks:[w.id]});
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
// Click su una cella della tabella: seleziona TUTTO il contenuto (così si sovrascrive subito,
// senza finire tra i singoli caratteri). setTimeout(0) per battere il mouseup che deseleziona.
if(gridEl) gridEl.addEventListener('focusin', e=>{
  const t = e.target;
  if(t && t.classList && t.classList.contains('cell') && !t.disabled){
    setTimeout(()=>{ try{ t.select(); }catch{} }, 0);
  }
});
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
  const dt = D(w.start);
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
  const W=640, H=236, padL=64, padR=14, padT=16, padB=42;
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
  const geo = JSON.stringify({W,H,padL,padR,padT,padB,innerW,innerH,n,lo,hi});
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" data-geo='${geo}' font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">`;
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
  // Asse X: una tacca per OGNI settimana; etichette di data sparse per non sovrapporsi.
  const baseY = padT + innerH;
  for(let i=0;i<n;i++){
    const x = X(i);
    s += `<line x1="${x.toFixed(1)}" y1="${baseY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(baseY+4).toFixed(1)}" stroke="#C7CBD1" stroke-width="1"/>`;
  }
  // Etichette di data EQUIDISTANTI (includono sempre prima e ultima), in numero adatto allo
  // spazio (~74px l'una nel sistema viewBox) per non sovrapporsi.
  const maxLbl = n<=1 ? 1 : Math.max(2, Math.min(n, Math.floor(innerW/74)));
  for(let k=0;k<maxLbl;k++){
    const i = maxLbl===1 ? 0 : Math.round(k*(n-1)/(maxLbl-1));
    const x = X(i);
    const anchor = k===0 ? 'start' : (k===maxLbl-1 ? 'end' : 'middle');
    s += `<text x="${x.toFixed(1)}" y="${(baseY+16).toFixed(1)}" text-anchor="${anchor}" font-size="9" fill="#6B7280">${esc(weekLabels[i]||'')}</text>`;
  }
  // Guida verticale + punto evidenziato (mostrati su hover via JS)
  s += `<line class="hoverline" x1="0" y1="${padT}" x2="0" y2="${baseY.toFixed(1)}" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="3 3" style="display:none" pointer-events="none"/>`;
  s += `<circle class="hoverdot" r="4" fill="${lineColor}" stroke="#fff" stroke-width="1.5" style="display:none" pointer-events="none"/>`;
  s += `</svg>`;
  return s;
}

// Tooltip condiviso dei grafici (creato una volta, riposizionato su hover).
function chartTip(){
  let t = document.getElementById('chartTip');
  if(!t){
    t = document.createElement('div');
    t.id = 'chartTip';
    document.body.appendChild(t);
  }
  return t;
}
// Monta un grafico nel contenitore e collega l'hover: guida verticale + punto + tooltip
// con la data della settimana e il livello di cassa. Geometria letta da data-geo (così la
// mappatura mouse→settimana resta corretta anche con l'SVG scalato a larghezza piena).
function mountChart(elId, values, labels, opts={}){
  const el = document.getElementById(elId); if(!el) return;
  el.innerHTML = chartSVG(values, labels, opts);
  const svg = el.querySelector('svg'); if(!svg) return;
  let G; try{ G = JSON.parse(svg.getAttribute('data-geo')||'null'); }catch{ G=null; }
  if(!G || !G.n) return;
  const line = svg.querySelector('.hoverline'), dot = svg.querySelector('.hoverdot');
  const tip = chartTip();
  const X = i => G.padL + (G.n<=1 ? G.innerW/2 : G.innerW*i/(G.n-1));
  const Y = v => G.padT + G.innerH*(1-(v-G.lo)/(G.hi-G.lo));
  function show(ev){
    const pt = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
    const r = svg.getBoundingClientRect(); if(!r.width) return;
    const sx = (pt.clientX - r.left)/r.width * G.W;             // px schermo -> coord viewBox
    const span = G.n<=1 ? 1 : G.innerW/(G.n-1);
    let i = Math.round((sx - G.padL)/span);
    i = Math.max(0, Math.min(G.n-1, i));
    const v = Number(values[i]||0);
    const x = X(i), y = Y(v);
    if(line){ line.setAttribute('x1', x.toFixed(1)); line.setAttribute('x2', x.toFixed(1)); line.style.display=''; }
    if(dot){ dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); dot.style.display=''; }
    tip.innerHTML = `<span class="ct-wk">${labels[i]||''}</span><span class="ct-val">${fmt(v)}</span>`;
    tip.style.display = 'block';
    tip.style.left = (pt.clientX + 14) + 'px';
    tip.style.top  = (pt.clientY + 14) + 'px';
  }
  function hide(){ if(line) line.style.display='none'; if(dot) dot.style.display='none'; tip.style.display='none'; }
  svg.addEventListener('mousemove', show);
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('touchstart', show, {passive:true});
  svg.addEventListener('touchmove', show, {passive:true});
  svg.addEventListener('touchend', hide);
}
// Ri-monta entrambi i grafici dall'ultima serie calcolata (usato anche all'ingresso in
// Dashboard, così l'SVG è dimensionato quando il contenitore è visibile — fix "non vedo
// gli andamenti dopo il refresh").
let lastCharts = null;
function mountCharts(){
  if(!lastCharts) return;
  mountChart('eopChart', lastCharts.eop, lastCharts.labels, {lineColor:'#0F172A', threshold:lastCharts.thr});
  mountChart('savChart', lastCharts.sav, lastCharts.labels, {lineColor:'#0f766e'});
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
  const wkOpts = future.map((ww,k)=>`<option value="${ww.id}" ${k===defK?'selected':''}>${D(ww.start).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</option>`).join('');
  const upcoming = future.filter(ww=>Number(r.values[ww.id]||0)!==0)
    .map(ww=>`${fmt(r.values[ww.id])} on ${D(ww.start).toLocaleDateString(undefined,{day:'numeric',month:'short'})}`);
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
  const dLabel = D(w.start).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
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
  h += `<div class="di-note">Showing one-off items only. Recurring items (e.g. Salary, Rent) update automatically — manage them in the “Full cash-flow view”. The summary above still reflects the full week.</div>`;
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
  const accs = accountsList();
  h += `<div class="di-group"><div class="di-group-title">Actual cash at end of week</div>`;
  if(accs.length){
    for(const a of accs){
      const v = accBal(w.id, a.id);
      h += `<div class="di-eoprow">
        <label class="di-name">${a.name}</label>
        <input class="di-input" type="number" inputmode="decimal" placeholder="0" value="${v!=null ? v : ''}" onblur="setAccountBalance('${w.id}','${a.id}', this.value)">
      </div>`;
    }
    const reconciled = !!(model.balances && model.balances[w.id] && Object.keys(model.balances[w.id]).length);
    const totalShown = reconciled ? weekActualSum(w.id) : t.eop;
    h += `<div class="di-eoprow di-eop-total"><label class="di-name">EoP (total)</label><span class="di-total">${fmt(totalShown)}</span></div>`;
    h += `<div class="di-hint">EoP = sum of your accounts; entering a balance back-solves the Adjustment. Manage accounts or connect a bank from <a href="#" onclick="openBanks();return false;">Banks &amp; cash</a>.</div>`;
  } else {
    h += `<div class="di-eoprow">
      <label class="di-name">Actual cash now (EoP)</label>
      <input class="di-input di-eop" type="number" inputmode="decimal" value="${t.eop}" onblur="editEop('${w.id}', this.value)">
    </div>`;
    h += `<div class="di-hint">Typing here adjusts the Adjustment so the balance matches reality. Tip: add your accounts or connect a bank in <a href="#" onclick="openBanks();return false;">Banks &amp; cash</a>.</div>`;
  }
  h += `</div>`;
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
  const shown = items.slice(0,3);
  if(shown.length>=2){
    const bar = document.createElement('div');
    bar.className = 'co-bar';
    bar.innerHTML = `<button class="co-dismiss-all" type="button">Dismiss all ✕</button>`;
    bar.querySelector('button').addEventListener('click', ()=>{ host.innerHTML=''; });
    host.appendChild(bar);
  }
  shown.forEach((f,i)=>{
    const div = document.createElement('div');
    div.className = `callout lvl-${f.level}`;
    div.style.animationDelay = (i*80)+'ms';
    div.innerHTML = `<span class="co-ic">${f.icon}</span><div class="co-body"><div class="co-title">${f.title}</div><div class="co-detail">${f.detail}</div><button class="co-link" onclick="gotoView('insights')">View insights →</button></div><button class="co-x" aria-label="Dismiss">×</button>`;
    div.querySelector('.co-x').addEventListener('click', ()=> div.remove());
    setTimeout(()=>{ div.classList.add('leaving'); setTimeout(()=>div.remove(), 300); }, 4000 + i*300);
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
  const CUR = currentWeekId();                 // settimana corrente (contiene oggi)
  const cw = wid => (wid===CUR ? ' cw' : '');  // classe shading settimana corrente
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
  lastCharts = { eop:eopSeries, sav:savSeries, labels:wkLabels, thr };
  mountCharts();

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
      // A granularità WEEK ogni periodo è una settimana: evidenzia quella corrente.
      html += `<th colspan="${span}" class="${cw(p.weeks[0])}">${p.label}${p.weeks[0]===CUR?' (Current week)':''}</th>`;
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
        for(const wid of p.weeks){ html += `<th class="${cw(wid)}">${weekLabelById(wid)}${wid===CUR?' (Current week)':''}</th>`; }
      }
    }
    html += '</tr>';
  }
  html += '</thead>';

  // TBODY
  html += '<tbody>';
  const secInf = !!ui.secCollapsed.inflows;
  html += `<tr class="section inflows sec-toggle" onclick="toggleSection('inflows')" title="Click to fold/unfold"><td class="sticky"><span class="chev">${secInf?'▸':'▾'}</span> Inflows</td>${periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('')}</tr>`;
  if(!secInf) for(const r of model.positives){
    html += `<tr class="inflow-row">`;
    const inCat = r.recur ? {c:'tag--recurring', t:'Recurring'} : {c:'tag--oneoff', t:'One-off'};
    html += `<td class="sticky"><div class="rowname"><span class="name">${r.name}</span> <span class="tag ${inCat.c}">${inCat.t}</span> <button class="iconbtn" title="Edit row" onclick="openRowMenu('positives','${r.id}')">✏️</button></div></td>`;
    for(const p of periods){
      if(ui.collapsed[p.id]){
        const agg = colSum(r, p.weeks);
        html += `<td class="agg-cell" title="Collapsed total — click ▶ on the period header to expand and enter weekly values"><input class="cell" type="number" value="${agg}" disabled></td>`;
      } else {
        for(const wid of p.weeks){
          const v = Number(r.values[wid]||0);
          html += `<td class="${cw(wid)}"><input class="cell" type="number" inputmode="decimal" value="${v}" onblur="editCell('positives','${r.id}','${wid}', this.value)"></td>`;
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
    // Un'unica matitina per riga: apre il menu (rinomina / ricorrenza / elimina), adattato ai flag.
    let btns = r.isAdjustment ? '' : `<button class="iconbtn" title="Edit row" onclick="openRowMenu('negatives','${r.id}')">✏️</button>`;
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
            row += `<td class="${cw(wid)}"><input class="cell" type="number" value="${v}" disabled title="Set automatically from the EoP row"></td>`;
          } else {
            row += `<td class="${cw(wid)}"><input class="cell" type="number" inputmode="decimal" value="${v}" onblur="editCell('negatives','${r.id}','${wid}', this.value)"></td>`;
          }
        }
      }
    }
    row += '</tr>';
    return row;
  };

  const secOut = !!ui.secCollapsed.outflows;
  html += `<tr class="section outflows sec-toggle" onclick="toggleSection('outflows')" title="Click to fold/unfold"><td class="sticky"><span class="chev">${secOut?'▸':'▾'}</span> Outflows</td>${emptyCells}</tr>`;
  // Le carte restano Outflows (sfondo rossino + tag "Credit card"); un riquadro leggero
  // racchiude l'intero gruppo, senza intestazione.
  const cardList = model.negatives.filter(r=>r.isCard);
  const firstCardId = cardList.length ? cardList[0].id : null;
  const lastCardId  = cardList.length ? cardList[cardList.length-1].id : null;
  if(!secOut) for(const r of model.negatives){
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
        html += `<td class="${cw(wid)}">${fmt(tWeek2[wid].bop)}</td>`;
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
        html += `<td class="${cw(wid)}">${fmt(tWeek2[wid].net)}</td>`;
      }
    }
  }
  html += '</tr>';
  // EoP row. Senza conti: editabile (back-solve diretto). Con conti: somma in SOLA LETTURA
  // (si inseriscono i saldi nelle righe per-conto sotto). Periodi compressi: sola lettura.
  const hasAccs = accountsList().length > 0;
  html += '<tr><td class="sticky">EoP (End of Period) <button class="iconbtn" title="Add a cash account / bank" onclick="openBanks()">＋</button></td>';
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
        if(hasAccs){
          html += `<td class="${tdCls} ${inCls}${cw(wid)}" title="Sum of your accounts (edit the account rows below)">${fmt(eop)}</td>`;
        } else {
          html += `<td class="${tdCls}${cw(wid)}"><input class="cell eop-cell ${inCls}" type="number" inputmode="decimal" value="${eop}" onblur="editEop('${wid}', this.value)" title="Type the actual end-of-period cash; the Adjustment row is recomputed"></td>`;
        }
      }
    }
  }
  html += '</tr>';
  // Righe per-conto (breakdown dell'EoP): inserimento manuale per settimana, una banca per riga.
  if(hasAccs){
    for(const a of accountsList()){
      html += `<tr class="account-row"><td class="sticky">↳ ${a.name}</td>`;
      for(const p of periods){
        if(ui.collapsed[p.id]){
          const lastWid = p.weeks[p.weeks.length-1];
          const v = accBal(lastWid, a.id);
          html += `<td>${v!=null ? fmt(v) : '—'}</td>`;
        } else {
          for(const wid of p.weeks){
            const v = accBal(wid, a.id);
            html += `<td class="${cw(wid)}"><input class="cell" type="number" inputmode="decimal" placeholder="0" value="${v!=null ? v : ''}" onblur="setAccountBalance('${wid}','${a.id}', this.value)"></td>`;
          }
        }
      }
      html += '</tr>';
    }
  }
  // Running Savings
  html += '<tr><td class="sticky" style="color:#0f766e;font-weight:600">Running Savings</td>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      const lastWid = p.weeks[p.weeks.length-1]; html += `<td>${fmt(tWeek2[lastWid].runSav)}</td>`;
    } else {
      for(const wid of p.weeks){ html += `<td class="${cw(wid)}">${fmt(tWeek2[wid].runSav)}</td>`; }
    }
  }
  html += '</tr>';

  html += '</tbody>';
  gridEl.innerHTML = html;
  setTimeout(sizeGridPanel, 0);   // mantiene l'header (date) agganciato: scroll verticale nel pannello
}

// ===== Handlers =====
function editCell(section,rowId,weekId,raw){
  const group = model[section];
  const row = group.find(r=>r.id===rowId); if(!row) return;
  let v = Number(raw||0);
  if(row.type==='OUTFLOW' && v>0) v = -v; // auto-negative for outflows
  row.values[weekId] = v;
  // NB: niente materialize qui — altrimenti una cella messa a 0 su una riga ricorrente
  // verrebbe ri-riempita col valore della ricorrenza (impossibile azzerare una settimana).
  // La ricorrenza si applica comunque su add voce / +settimana / modifica ricorrenza / init.
  save(model); render();
}
// EoP effettivo: l'utente digita la cassa reale di fine settimana e si calcola a
// ritroso la riga Adjustment (vedi decisione Fase 0). EOP resta calcolato (bop+net);
// cambia solo Adjustment, il data model è preservato.
// Back-solve l'Adjustment della settimana perché l'EoP combaci con `target`.
function backSolveEop(weekId, target){
  const adj = model.negatives.find(r=>r.isAdjustment); if(!adj) return;
  const t = totalsByWeek(model)[weekId]; if(!t) return;
  const adjVal = Number(adj.values[weekId]||0);
  const netExclAdj = t.net - adjVal;            // net della settimana ESCLUSO Adjustment
  adj.values[weekId] = Number(target||0) - t.bop - netExclAdj;  // bop(i)=eop(i-1), invariato
}
function editEop(weekId, raw){ backSolveEop(weekId, Number(raw||0)); materialize(model); save(model); render(); }

// ===== Conti cassa/banca (Opzione A): EoP = somma dei saldi per-conto =====
function accountsList(){ return Array.isArray(model.accounts) ? model.accounts : []; }
function weekActualSum(weekId){
  const b = (model.balances && model.balances[weekId]) || {};
  return accountsList().reduce((s,a)=> s + Number(b[a.id]||0), 0);
}
// Ricalcola l'Adjustment della settimana dalla somma dei saldi conto (se la settimana è "riconciliata").
function reconcileWeek(weekId){
  if(!(model.balances && model.balances[weekId])) return;
  backSolveEop(weekId, weekActualSum(weekId));
}
// Saldo inserito per (settimana, conto): null se non inserito.
function accBal(weekId, accId){
  const b = model.balances && model.balances[weekId];
  return (b && (accId in b)) ? Number(b[accId]) : null;
}
function setAccountBalance(weekId, accId, raw){
  model.balances = model.balances || {};
  const wk = model.balances[weekId] = model.balances[weekId] || {};
  const s = String(raw == null ? '' : raw).trim();
  if(s === ''){ delete wk[accId]; }            // campo svuotato -> non inserito
  else { wk[accId] = Number(s) || 0; }
  if(Object.keys(wk).length === 0){ delete model.balances[weekId]; } // settimana non più riconciliata
  else { reconcileWeek(weekId); }
  materialize(model); save(model); render();
}
function addAccount(name){
  name = (name||'').trim(); if(!name) return;
  model.accounts = accountsList();
  model.accounts.push({ id: uid(), name });
  save(model); render(); renderBanksModal();
}
function removeAccount(accId){
  model.accounts = accountsList().filter(a=>a.id!==accId);
  if(model.balances){
    for(const wid of Object.keys(model.balances)){
      if(model.balances[wid] && (accId in model.balances[wid])){
        delete model.balances[wid][accId];
        if(Object.keys(model.balances[wid]).length===0) delete model.balances[wid];
        else reconcileWeek(wid);
      }
    }
  }
  materialize(model); save(model); render(); renderBanksModal();
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

// ===== Modale azioni riga (matitina): rinomina / ricorrenza / elimina =====
const rowModal = document.getElementById('rowModal');
const rowNameInput = document.getElementById('rowName');
let rowCtx = null;
function openRowMenu(section, rowId){
  const row = model[section] && model[section].find(r=>r.id===rowId); if(!row) return;
  rowCtx = { section, rowId };
  document.getElementById('rowTitle').textContent = `Edit “${row.name}”`;
  rowNameInput.value = row.name;
  document.getElementById('rowRecur').style.display = row.isCard ? 'none' : '';   // carte: no ricorrenza
  document.getElementById('rowDelete').style.display = row.locked ? 'none' : '';  // locked: no elimina
  rowModal.classList.add('show');
  setTimeout(()=> rowNameInput.focus(), 50);
}
function closeRowMenu(){ rowModal.classList.remove('show'); rowCtx = null; }
function saveRowName(){
  if(!rowCtx){ closeRowMenu(); return; }
  const row = model[rowCtx.section].find(r=>r.id===rowCtx.rowId);
  const n = rowNameInput.value.trim();
  if(row && n){ row.name = n; save(model); render(); }
  closeRowMenu();
}
document.getElementById('rowSave').addEventListener('click', saveRowName);
document.getElementById('rowCancel').addEventListener('click', closeRowMenu);
document.getElementById('rowOverlay').addEventListener('click', closeRowMenu);
document.getElementById('rowRecur').addEventListener('click', ()=>{ const c=rowCtx; closeRowMenu(); if(c) editRecurrence(c.section, c.rowId); });
document.getElementById('rowDelete').addEventListener('click', ()=>{ const c=rowCtx; closeRowMenu(); if(c) deleteRow(c.section, c.rowId); });
rowNameInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); saveRowName(); } });
document.getElementById('menuPersonalArea').addEventListener('click', e=>{ e.preventDefault(); showInfo('Personal Area', 'Coming soon — profile, linked banks and more.'); });
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
// Comprime/espande un'intera sezione (Inflows / Outflows) per accorciare lo scroll.
function toggleSection(key){ ui.secCollapsed = ui.secCollapsed || {}; ui.secCollapsed[key] = !ui.secCollapsed[key]; savePrefs(); render() }
// Stato d'apertura della full view: vista per MESE, ma con il mese CORRENTE espanso a
// settimane (celle editabili) e tutti gli altri mesi raggruppati (overview a totali).
function defaultMonthGrouping(){
  ui.gran = 'MONTH';
  ui.collapsed = {};
  const cur = currentWeekId();
  const periods = buildPeriods(model, 'MONTH');
  periods.forEach(p=>{ ui.collapsed[p.id] = !(cur && p.weeks.includes(cur)); }); // espandi solo il mese corrente
  if(periods.length && !periods.some(p=> !ui.collapsed[p.id])) ui.collapsed[periods[0].id] = false; // fallback: primo mese
}
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
  const start=iso(addDays(last.end,1)); const end=iso(addDays(start,6));
  const w={id:uid(), start, end}; model.weeks.push(w);
  model.positives.forEach(r=>r.values[w.id]=0); model.negatives.forEach(r=>r.values[w.id]=0);
  materialize(model); save(model); render();
}

// Bind view navigation (How to / Dashboard / Weekly data input / Full cash-flow view)
const VIEWS = ['howto','dashboard','insights','datainput','full'];
function setView(view){
  if(!VIEWS.includes(view)) view = 'howto';
  for(const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.getAttribute('data-view')===view));
  for(const v of VIEWS) document.body.classList.toggle('view-'+v, v===view);
}
function gotoView(view){ setView(view); try{ sessionStorage.setItem('cf_view', view); }catch{} window.scrollTo(0,0); if(view==='full'){ setTimeout(sizeGridPanel, 0); setTimeout(scrollToCurrentWeek, 60); } if(view==='dashboard') setTimeout(mountCharts, 30); }
// Posiziona la tabella mostrando dalla settimana PRECEDENTE alla corrente (scroll a ritroso libero).
function scrollToCurrentWeek(){
  const panel = document.getElementById('gridPanel'); if(!panel) return;
  const cell = panel.querySelector('thead .cw'); if(!cell) return;
  const sticky = panel.querySelector('thead th.sticky');
  const stickyW = sticky ? sticky.offsetWidth : 0;
  const delta = cell.getBoundingClientRect().left - panel.getBoundingClientRect().left;
  panel.scrollLeft = Math.max(0, panel.scrollLeft + delta - stickyW - cell.offsetWidth); // lascia ~una colonna prima
}
// Limita l'altezza del pannello tabella all'area visibile: così lo scroll verticale avviene
// DENTRO il pannello e l'header (riga delle date) resta agganciato in alto (position:sticky).
function sizeGridPanel(){
  const panel = document.getElementById('gridPanel'); if(!panel) return;
  if(!document.body.classList.contains('view-full')){ panel.style.maxHeight=''; return; }
  const top = panel.getBoundingClientRect().top;            // distanza dal bordo alto del viewport
  const h = Math.max(260, window.innerHeight - top - 14);   // riempi fino in fondo (margine 14px)
  panel.style.maxHeight = h + 'px';
}
window.addEventListener('resize', sizeGridPanel);
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
  const sDate=D(s), eDate=D(e);
  if(eDate < sDate){ toast('End date must be after start date.'); return; }
  const newWeeks = weeksFromDates(s, e);
  // Conserva i dati GIÀ inseriti. Gli id settimana sono casuali e iso() può sfasare la data
  // di ±1 giorno per fuso orario, quindi NON facciamo match esatto sulla stringa: associamo
  // ogni nuova settimana alla vecchia con la data di inizio PIÙ VICINA (entro <4 giorni, cioè
  // meno di mezza settimana → nessuna ambiguità). Così cambiare l'orizzonte non azzera i dati.
  const TOL = 4*24*3600*1000;
  const oldList = model.weeks.map(w=>({ id:w.id, t:D(w.start).getTime() }));
  const oldIdFor = (startISO)=>{
    const t = D(startISO).getTime();
    let best=null, bestd=TOL;
    for(const o of oldList){ const dd=Math.abs(o.t-t); if(dd<bestd){ bestd=dd; best=o.id; } }
    return best;
  };
  const remapRow=(row)=>{
    const nv = {};
    for(const w of newWeeks){
      const oid = oldIdFor(w.start);
      nv[w.id] = (oid!=null && row.values[oid]!=null) ? row.values[oid] : 0;
    }
    row.values = nv; return row;
  };
  // Rimappa anche i saldi per-conto (model.balances) per data più vicina.
  if(model.balances){
    const nb = {};
    for(const w of newWeeks){ const oid = oldIdFor(w.start); if(oid!=null && model.balances[oid]) nb[w.id] = model.balances[oid]; }
    model.balances = nb;
  }
  model.weeks = newWeeks;
  model.positives = model.positives.map(remapRow);
  model.negatives = model.negatives.map(remapRow);
  materialize(model); save(model);
  ui.collapsed={}; savePrefs();
  toast('Horizon updated — entered values kept where weeks overlap.');
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

// Data: azzera tutto il tabellone (distruttivo, doppia conferma)
function doClearAll(){
  const s = model.weeks[0] && model.weeks[0].start;
  const e = model.weeks.length && model.weeks[model.weeks.length-1].end;
  model = (s && e) ? emptyModel({ start:s, end:e }) : emptyModel();  // mantiene l'orizzonte date
  materialize(model); save(model); render();
  toast('All data cleared.');
}
document.getElementById('clearAllBtn').addEventListener('click', ()=>{
  askConfirm('Clear all data?', 'This removes every income, expense, credit card, account balance and amount. The date range is kept. This cannot be undone.', 'Continue', ()=>{
    askConfirm('Are you absolutely sure?', 'Second and final confirmation: the whole table will be permanently cleared.', 'Clear all', doClearAll);
  });
});

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
const dayField       = document.getElementById('dayField');
const itemDay        = document.getElementById('itemDay');
const recurHint      = document.getElementById('recurHint');
const itemCardField  = document.getElementById('itemCardField');
const itemCard       = document.getElementById('itemCard');

let modalCtx = null; // { mode:'add'|'recur', type, section?, rowId?, card? }

function updateRecurUI(){
  recurFields.style.display = itemRecurring.checked ? '' : 'none';
  const isMonthly = itemFreq.value==='MONTHLY';
  everyField.style.display = (itemRecurring.checked && itemFreq.value==='CUSTOM') ? '' : 'none';
  dayField.style.display   = (itemRecurring.checked && isMonthly) ? '' : 'none';   // "quando": giorno del mese
  if(itemRecurring.checked){
    const n = Math.max(1, Number(itemEvery.value||1));
    const dd = Math.min(31, Math.max(1, Number(itemDay.value||1)));
    const ord = (dd===1?'1st':dd===2?'2nd':dd===3?'3rd':dd===21?'21st':dd===22?'22nd':dd===23?'23rd':dd===31?'31st':dd+'th');
    const map = { WEEKLY:'every week', BIWEEKLY:'every 2 weeks', MONTHLY:`every month, around the ${ord}`, CUSTOM:`every ${n} week${n===1?'':'s'}` };
    recurHint.textContent = `It will be added automatically ${map[itemFreq.value]||''}.`
      + (isMonthly ? ' (months shorter than that day use their last day).' : '');
  } else {
    recurHint.textContent = 'No recurrence: the item starts empty — enter the weekly amounts by hand.';
  }
}
itemRecurring.addEventListener('change', updateRecurUI);
itemFreq.addEventListener('change', updateRecurUI);
itemEvery.addEventListener('input', updateRecurUI);
itemDay.addEventListener('input', updateRecurUI);

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
    itemDay.value = '1';
  } else { // 'recur'
    const row = model[ctx.section].find(r=>r.id===ctx.rowId);
    itemModalTitle.textContent = `Recurrence — ${row?.name || ''}`;
    itemNameField.style.display = 'none';
    itemCardField.style.display = 'none';
    itemRecurring.checked = !!row?.recur;
    itemAmount.value = Math.abs(Number(row?.recur?.amount ?? (ctx.type==='INFLOW'?1000:50)));
    itemFreq.value = row?.recur?.kind || 'WEEKLY';
    itemEvery.value = row?.recur?.every || 4;
    itemDay.value = row?.recur?.day || 1;
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
  const recur = { kind, every, amount };
  if(kind==='MONTHLY') recur.day = Math.min(31, Math.max(1, Number(itemDay.value||1))); // "quando" nel mese
  return recur;
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
  if(bankModal.classList.contains('show')) closeBank();
  if(banksModal.classList.contains('show')) closeBanks();
  if(rowModal.classList.contains('show')) closeRowMenu();
});

// ===== Integrazione bancaria (Edge Function "bank", TrueLayer) =====
async function callBank(payload){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return { error:'no_session' };
  try{
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/bank`, {
      method:'POST',
      headers:{ 'content-type':'application/json', Authorization:`Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(()=>({ error:'bad_json' }));
    if(!res.ok && !data.error) data.error = 'http_'+res.status;
    return data;
  }catch(e){ return { error:String(e) }; }
}
async function connectBank(providerId){
  const r = await callBank({ action:'connect', redirectUri: location.origin, providerId });
  console.log('bank connect →', { env: r.env, authHost: r.authHost, url: r.url });
  if(!r.url){ toast('Bank connection unavailable: ' + (r.error||'error')); return; }
  if(r.state) sessionStorage.setItem('tl_state', r.state);
  // Mostra l'URL esatto (ispezionabile/copiabile) + link per procedere, così se TrueLayer
  // risponde "bad request" possiamo leggere i parametri (redirect_uri, providers, client_id).
  bankSelectField.style.display = 'none';
  bankMsg.innerHTML = `Continue to TrueLayer to authorise: `
    + `<a href="${r.url}" rel="noopener">Open TrueLayer →</a>`
    + `<br><small style="opacity:.65;word-break:break-all">${r.url.replace(/</g,'&lt;')}</small>`;
  bankModal.classList.add('show');
}
async function syncBank(weekId){
  toast('Syncing from your bank…');
  const r = await callBank({ action:'balance' });
  // non connesso, oppure consenso/token scaduto o invalido (es. ri-consenso ~90gg, cambio ambiente) -> ricollega
  if(r.error==='not_connected' || r.error==='refresh_failed'){
    toast('Please reconnect your bank.');
    openBankPicker();
    return;
  }
  if(typeof r.balance==='number'){ editEop(weekId, r.balance); toast(`Synced ${fmt(r.balance)} from your bank.`); return; }
  console.error('bank balance response:', r);
  const det = r.detail ? ' — ' + (typeof r.detail==='string'? r.detail : JSON.stringify(r.detail)).slice(0,140) : '';
  toast('Could not read balance: ' + (r.error||'unknown') + det);
}
// Selettore banca: prova l'elenco provider; se non disponibile, usa la schermata TrueLayer.
const bankModal = document.getElementById('bankModal');
const bankMsg = document.getElementById('bankMsg');
const bankSelect = document.getElementById('bankSelect');
const bankSelectField = document.getElementById('bankSelectField');
function closeBank(){ bankModal.classList.remove('show'); }
function openBankPicker(){
  // La scelta della banca avviene sulla pagina sicura di TrueLayer (hosted screen):
  // più robusto del link per-provider (che dava "bad request" con id non-filtro).
  bankSelectField.style.display = 'none';
  bankMsg.textContent = "You'll choose your bank on TrueLayer's secure page.";
  bankModal.classList.add('show');
}
document.getElementById('bankCancel').addEventListener('click', closeBank);
document.getElementById('bankOverlay').addEventListener('click', closeBank);
document.getElementById('bankConnect').addEventListener('click', ()=>{
  const id = bankSelectField.style.display==='none' ? undefined : bankSelect.value;
  closeBank();
  connectBank(id);
});
// ===== Modale "Banks & cash" (conti manuali + connessione banca) =====
const banksModal = document.getElementById('banksModal');
const banksList = document.getElementById('banksList');
const banksBankBox = document.getElementById('banksBankBox');
const newAccountName = document.getElementById('newAccountName');
function renderBanksModal(){
  const accs = accountsList();
  banksList.innerHTML = accs.length
    ? accs.map(a => `<div class="bk-row"><span class="bk-name">${a.name}</span><button class="iconbtn" title="Remove" onclick="removeAccount('${a.id}')">🗑️</button></div>`).join('')
    : `<div class="di-empty">No accounts yet — add one below, or connect a bank.</div>`;
  let box = `<button class="ghost" type="button" onclick="openBankPicker()">🏦 Connect a bank (TrueLayer)</button>`;
  if(!accs.length) box += ` <button class="ghost" type="button" onclick="syncBank(currentWeekId())">Sync balance → this week's EoP</button>`;
  box += `<div class="di-hint">Auto-syncing each bank to its own account will arrive once bank access is fully live; for now add accounts manually.</div>`;
  banksBankBox.innerHTML = box;
}
function openBanks(){ drawer.classList.remove('show'); renderBanksModal(); banksModal.classList.add('show'); }
function closeBanks(){ banksModal.classList.remove('show'); }
document.getElementById('menuBanks').addEventListener('click', e=>{ e.preventDefault();
  showInfo('Connect your banks', 'Automatic bank connections are coming soon (work in progress). For now, add your accounts manually in the ⚙️ Settings of the “Full cash-flow view” (or with the + on the table), then enter each balance.');
});
document.getElementById('manageBanksBtn').addEventListener('click', openBanks);

// Cancellazione account (doppia conferma) — usa la Edge Function "account".
async function deleteAccount(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return;
  toast('Deleting your account…');
  try{
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/account`, {
      method:'POST',
      headers:{ 'content-type':'application/json', Authorization:`Bearer ${session.access_token}` },
      body: JSON.stringify({ action:'delete' }),
    });
    const r = await res.json().catch(()=>({ error:'bad_response' }));
    if(r.deleted){ try{ sessionStorage.removeItem('cf_view'); }catch{} await sb.auth.signOut(); location.reload(); return; }
    toast('Could not delete account: ' + (r.error||'error'));
  }catch(e){ toast('Could not delete account: ' + e); }
}
document.getElementById('menuDeleteAccount').addEventListener('click', e=>{
  e.preventDefault();
  drawer.classList.remove('show');
  askConfirm('Delete your account?', 'This permanently deletes your account and ALL your data (cash-flow, accounts, balances). It cannot be undone.', 'Continue', ()=>{
    askConfirm('Are you absolutely sure?', 'Final confirmation: your account and all data will be permanently removed.', 'Delete account', deleteAccount);
  });
});
document.getElementById('banksClose').addEventListener('click', closeBanks);
document.getElementById('banksModalOverlay').addEventListener('click', closeBanks);
document.getElementById('addAccountBtn').addEventListener('click', ()=>{ addAccount(newAccountName.value); newAccountName.value=''; });
newAccountName.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addAccount(newAccountName.value); newAccountName.value=''; } });

// Ritorno dal consenso TrueLayer (?code&state) — chiamato in init() dopo il login.
async function handleBankRedirect(){
  const qs = new URLSearchParams(location.search);
  const code = qs.get('code'), st = qs.get('state');
  if(!code || !st || st !== sessionStorage.getItem('tl_state')) return;
  sessionStorage.removeItem('tl_state');
  const r = await callBank({ action:'callback', code, redirectUri: location.origin });
  history.replaceState({}, '', location.origin + location.pathname); // pulisci l'URL
  toast(r.connected ? 'Bank connected ✓' : 'Bank connection failed: ' + (r.error||'error'));
}

// Expose some funcs for inline handlers
window.setAccountBalance = setAccountBalance;
window.removeAccount = removeAccount;
window.openBanks = openBanks;
window.openBankPicker = openBankPicker;
window.currentWeekId = currentWeekId;
window.togglePeriod = togglePeriod;
window.toggleSection = toggleSection;
window.openRowMenu = openRowMenu;
window.syncBank = syncBank;
window.connectBank = connectBank;
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
  let saved = await storage.load();
  if(saved.error){                                   // errore transitorio (rete/token): un retry
    await new Promise(r=>setTimeout(r, 800));
    saved = await storage.load();
  }
  if(saved.error){
    // CRITICO: non far partire l'app con dati demo, altrimenti il primo save
    // sovrascriverebbe i dati reali nel cloud. Meglio fermarsi e avvisare.
    alert('⚠️ Could not load your data (network or session issue). To protect your saved data, the app will NOT start with empty/demo data. Please check your connection and refresh the page.');
    return;
  }
  const isNewUser = !saved.model;
  model = saved.model || demo();
  const migrated = normalizeWeeksToMonday(model);    // corregge settimane sfasate (vecchio bug di fuso)
  materialize(model);
  if(isNewUser || migrated) save(model);             // salva i dati di esempio (utente nuovo) o la migrazione

  ui = saved.prefs || {gran:'MONTH',collapsed:{},eopThreshold:0,start:'',end:'',seenHowto:false};
  if(!ui.gran) ui.gran='MONTH';
  if(!ui.collapsed) ui.collapsed={};
  if(!ui.secCollapsed) ui.secCollapsed={};
  if(typeof ui.eopThreshold!=='number') ui.eopThreshold=0;

  // All'apertura: full view per mese con il mese corrente espanso a settimane (gli altri raggruppati).
  defaultMonthGrouping();

  // Initialize inputs to current model horizon
  if(model.weeks.length){
    startInput.value = model.weeks[0].start;
    endInput.value = model.weeks[model.weeks.length-1].end;
  }
  updateGranSeg();
  eopInput.value = ui.eopThreshold;

  // Vista d'ingresso: su REFRESH (stessa scheda) resta dov'eri; al NUOVO ingresso vai in
  // Dashboard (How to solo al primo accesso assoluto). cf_view sta in sessionStorage (per-tab),
  // azzerato al logout.
  const savedView = sessionStorage.getItem('cf_view');
  let landing;
  if(savedView && VIEWS.includes(savedView)){
    landing = savedView;                                  // refresh
  } else if(!ui.seenHowto){
    landing = 'howto'; ui.seenHowto = true; savePrefs();  // primo accesso assoluto
  } else {
    landing = 'dashboard';                                // nuovo ingresso
  }
  setView(landing);
  sessionStorage.setItem('cf_view', landing);

  // Initial render
  render();

  // Ritorno dal consenso bancario (TrueLayer) se presente nell'URL
  handleBankRedirect();

  // Call-out flottanti all'apertura, se ci sono segnalazioni
  const findings = computeInsights();
  if(findings.length) setTimeout(()=> showCallouts(findings), 400);
}
// L'avvio è gestito da auth.js dopo l'autenticazione (Fase 2).
window.initApp = init;
