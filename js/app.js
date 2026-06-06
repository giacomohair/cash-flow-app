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
const init6mBtn=document.getElementById('init6mBtn');
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
        html += `<td><input class="cell" type="number" value="${agg}" disabled title="Expand period to edit weeks"></td>`;
      } else {
        for(const wid of p.weeks){
          const v = Number(r.values[wid]||0);
          html += `<td><input class="cell" type="number" inputmode="decimal" value="${v}" onblur="editCell('positives','${r.id}','${wid}', this.value)"></td>`;
        }
      }
    }
    html += '</tr>';
  }

  html += `<tr class="section outflows"><td class="sticky">Outflows</td>${periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('')}</tr>`;
  for(const r of model.negatives){
    const trClass = r.isAdjustment ? 'adjustment-row' : 'outflow-row';
    html += `<tr class="${trClass}">`;
    const tags = [];
    if(r.locked) tags.push('Locked');
    if(r.isAdjustment) tags.push('Adjustment');
    html += `<td class="sticky"><div class="rowname"><span class="name">${r.name}</span> ${tags.map(t=>`<span class="tag">${t}</span>`).join(' ')} ${(!r.isAdjustment && !r.locked) ? `<button class="iconbtn" title="Recurrence" onclick="editRecurrence('negatives','${r.id}')">📅</button> <button class="iconbtn" title="Delete" onclick="deleteRow('negatives','${r.id}')">🗑️</button>`:''}</div></td>`;
    for(const p of periods){
      if(ui.collapsed[p.id]){
        const agg = colSum(r, p.weeks);
        html += `<td><input class="cell" type="number" value="${agg}" disabled title="Expand period to edit weeks"></td>`;
      } else {
        for(const wid of p.weeks){
          const v = Number(r.values[wid]||0);
          html += `<td><input class="cell" type="number" inputmode="decimal" value="${v}" onblur="editCell('negatives','${r.id}','${wid}', this.value)"></td>`;
        }
      }
    }
    html += '</tr>';
  }

  // Totals
  const tWeek2 = totalsByWeek(model);
  const thr2 = Number(ui.eopThreshold||0);

  html += `<tr class="section balances"><td class="sticky">Balances</td>${periods.map(p=> ui.collapsed[p.id]? '<td></td>': p.weeks.map(_=>'<td></td>').join('') ).join('')}</tr>`;
  // BoP row
  html += '<tr><td class="sticky">BoP</td>';
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
  // EoP row (with threshold highlighting + background)
  html += '<tr><td class="sticky">EoP</td>';
  for(const p of periods){
    if(ui.collapsed[p.id]){
      const lastWid = p.weeks[p.weeks.length-1];
      const eop = tWeek2[lastWid].eop;
      const cls = (eop < thr2) ? 'danger danger-bg' : '';
      html += `<td class="${cls}">${fmt(eop)}</td>`;
    } else {
      for(const wid of p.weeks){
        const eop = tWeek2[wid].eop;
        const cls = (eop < thr2) ? 'danger danger-bg' : '';
        html += `<td class="${cls}">${fmt(eop)}</td>`;
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

// Drawer & period controls
function openPersonalArea(){ alert('Personal Area — placeholder for profile, banks, etc.'); }
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
const VIEWS = ['dashboard','full'];
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
init6mBtn.addEventListener('click', ()=>{ model=demo(); materialize(model); save(model); startInput.value=model.weeks[0].start; endInput.value=model.weeks[model.weeks.length-1].end; render() });

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

let modalCtx = null; // { mode:'add'|'recur', type, section?, rowId? }

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
    itemModalTitle.textContent = ctx.type==='INFLOW' ? 'New inflow' : 'New outflow';
    itemNameField.style.display = '';
    itemName.value = '';
    itemRecurring.checked = false;
    itemAmount.value = ctx.type==='INFLOW' ? '1000' : '50';
    itemFreq.value = 'WEEKLY';
    itemEvery.value = '4';
  } else { // 'recur'
    const row = model[ctx.section].find(r=>r.id===ctx.rowId);
    itemModalTitle.textContent = `Recurrence — ${row?.name || ''}`;
    itemNameField.style.display = 'none';
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
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && itemModal.classList.contains('show')) closeItemModal(); });

// Expose some funcs for inline handlers
window.togglePeriod = togglePeriod;
window.editCell = editCell;
window.deleteRow = deleteRow;
window.editRecurrence = editRecurrence;
window.openPersonalArea = ()=> openPersonalArea();

// ===== Bootstrap (async: carica da storage, poi inizializza UI e render) =====
async function init(){
  const saved = await storage.load();
  model = saved.model || emptyModel(); materialize(model); save(model);

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
