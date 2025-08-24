import React, { useEffect, useState } from 'react'
import { register, login, renderView, editCell, addItem, delItem, setRecurrence, setSettings, applyDates, clearToken } from './api'
import './styles.css'

type Gran = 'WEEK'|'MONTH'|'QUARTER'|'YEAR'
type Settings = { gran: Gran, collapse: boolean, alert: number, dates?: {start?:string, end?:string} }

export default function App(){
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('demo@example.com')
  const [password, setPassword] = useState('demo1234')

  const [html, setHtml] = useState('')
  const [settings, setStateSettings] = useState<Settings>({gran:'MONTH', collapse:false, alert:0})
  const [activeTab, setActiveTab] = useState<'dates'|'view'|'items'|'alerts'|'more'>('dates')
  const [menuOpen, setMenuOpen] = useState(false)

  async function load(){
    const { html, settings } = await renderView()
    setHtml(html); setStateSettings({
      gran: (settings.gran||'MONTH'),
      collapse: !!settings.collapse,
      alert: settings.alert||0,
      dates: settings.dates||{}
    })
  }
  async function saveSettings(next: Partial<Settings>){
    await setSettings(next); await load()
  }
  useEffect(()=>{ if(authed){ load() } }, [authed])

  if(!authed){
    return (
      <div style={{maxWidth:420, margin:'40px auto', background:'#fff', padding:16, borderRadius:12, border:'1px solid #E6E7EB'}}>
        <h2>Cash‑Flow Forecaster</h2>
        <label>Email<br/><input style={{width:'100%'}} value={email} onChange={e=>setEmail(e.target.value)} /></label><br/>
        <label>Password<br/><input style={{width:'100%'}} type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <div style={{display:'flex', gap:8, marginTop:12}}>
          <button className="primary" onClick={async()=>{ await register(email,password); setAuthed(true) }}>Register</button>
          <button onClick={async()=>{ await login(email,password); setAuthed(true) }}>Login</button>
        </div>
      </div>
    )
  }

  async function onGridClick(e: React.MouseEvent<HTMLDivElement>){
    const t = e.target as HTMLElement
    if(t.tagName === 'INPUT' && t.classList.contains('cell')){
      const inp = t as HTMLInputElement
      inp.select()
    }
    if(t.classList.contains('delete')){
      const rowId = t.getAttribute('data-row')!
      const section = t.getAttribute('data-section') as 'positives'|'negatives'
      if(confirm('Delete this item?')){ await delItem(section, rowId); await load() }
    }
    if(t.classList.contains('recurrence')){
      const rowId = t.getAttribute('data-row')!
      const section = t.getAttribute('data-section') as 'positives'|'negatives'
      const amount = parseFloat(prompt('Amount per occurrence?', '100') || '0')
      const kind = (prompt('Frequency? (WEEKLY, BIWEEKLY, MONTHLY, CUSTOM)', 'WEEKLY') || 'WEEKLY').toUpperCase()
      let every = 1
      if(kind === 'CUSTOM'){ every = parseInt(prompt('Every how many weeks?', '4') || '4', 10) }
      await setRecurrence(section, rowId, amount, kind, every)
      await load()
    }
    if(t.classList.contains('collapse-toggle')){
      await saveSettings({ collapse: !settings.collapse })
    }
  }

  return (
    <div>
      <header>
        <div className="bar">
          <button className="hamburger" id="menuBtn" title="Menu" onClick={()=>setMenuOpen(v=>!v)}>☰</button>
          <h1>Cash‑Flow Forecaster</h1>
          <div className="spacer"></div>
          {menuOpen && (
            <div style={{position:'absolute', right:16, top:48, background:'#fff', border:'1px solid #E6E7EB', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', padding:8, zIndex:1000}}>
              <button className="ghost" onClick={()=>{ clearToken(); setAuthed(false); setMenuOpen(false); }}>Log out</button>
            </div>
          )}
        </div>

        <div className="toolbar">
          <div role="tablist" className="tablist" id="tablist">
            {(['dates','view','items','alerts','more'] as const).map(tab=>(
              <button key={tab} className="tab" role="tab"
                aria-selected={activeTab===tab} data-tab={tab}
                onClick={()=>setActiveTab(tab)}>
                {tab[0].toUpperCase()+tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="tabpanes">
            {/* Dates */}
            <div className={`tabpane ${activeTab==='dates'?'show':''}`} id="pane-dates">
              <label title="Start date (snaps to Monday)">Start&nbsp;
                <input type="date" value={settings.dates?.start||''} onChange={e=>setStateSettings(s=>({...s, dates:{...(s.dates||{}), start:e.target.value}}))}/>
              </label>
              <label title="End date (snaps to Sunday)">End&nbsp;
                <input type="date" value={settings.dates?.end||''} onChange={e=>setStateSettings(s=>({...s, dates:{...(s.dates||{}), end:e.target.value}}))}/>
              </label>
              <button className="ghost" onClick={async()=>{
                const s=settings.dates?.start, e=settings.dates?.end
                if(!s||!e){ alert('Pick both dates'); return }
                await applyDates(s,e); await load()
              }}>Apply dates</button>
            </div>

            {/* View */}
            <div className={`tabpane ${activeTab==='view'?'show':''}`} id="pane-view">
              <label>View
                <select value={settings.gran} onChange={async e=>{ await saveSettings({ gran: e.target.value as Gran }); }}>
                  <option value="WEEK">Weeks</option>
                  <option value="MONTH">Months</option>
                  <option value="QUARTER">Quarters</option>
                  <option value="YEAR">Years</option>
                </select>
              </label>
              <button className="ghost" onClick={async()=>{ await saveSettings({ collapse: true }) }}>Collapse all</button>
              <button className="ghost" onClick={async()=>{ await saveSettings({ collapse: false }) }}>Expand all</button>
            </div>

            {/* Items */}
            <div className={`tabpane ${activeTab==='items'?'show':''}`} id="pane-items">
              <button className="ghost" onClick={async()=>{
                const name = prompt('Name of inflow?', 'New Inflow') || 'New Inflow'
                const rec = confirm('Is it recurrent?')
                let amount = 0, kind: string|undefined = undefined, every: number|undefined = undefined
                if(rec){ amount = parseFloat(prompt('Amount per occurrence?', '100') || '0'); kind = (prompt('Frequency? (WEEKLY, BIWEEKLY, MONTHLY, CUSTOM)','WEEKLY') || 'WEEKLY').toUpperCase(); if(kind==='CUSTOM'){ every = parseInt(prompt('Every how many weeks?','4')||'4',10) } }
                await addItem('positives', name, 'INFLOW', amount, kind, every); await load()
              }}>+ Inflow</button>

              <button className="ghost" onClick={async()=>{
                const name = prompt('Name of outflow?', 'New Outflow') || 'New Outflow'
                const rec = confirm('Is it recurrent?')
                let amount = 0, kind: string|undefined = undefined, every: number|undefined = undefined
                if(rec){ amount = parseFloat(prompt('Amount per occurrence?', '100') || '0'); kind = (prompt('Frequency? (WEEKLY, BIWEEKLY, MONTHLY, CUSTOM)','WEEKLY') || 'WEEKLY').toUpperCase(); if(kind==='CUSTOM'){ every = parseInt(prompt('Every how many weeks?','4')||'4',10) } }
                await addItem('negatives', name, 'OUTFLOW', amount, kind, every); await load()
              }}>+ Outflow</button>
            </div>

            {/* Alerts */}
            <div className={`tabpane ${activeTab==='alerts'?'show':''}`} id="pane-alerts">
              <label>EoP Alert&nbsp;
                <input type="number" value={settings.alert} onChange={e=>setStateSettings(s=>({...s, alert: Number(e.target.value||'0')}))} />
              </label>
              <button className="ghost" onClick={async()=>{ await saveSettings({ alert: settings.alert }) }}>Save threshold</button>
            </div>

            {/* More */}
            <div className={`tabpane ${activeTab==='more'?'show':''}`} id="pane-more">
              <span style={{opacity:.7}}>More actions placeholder.</span>
            </div>
          </div>
        </div>
      </header>

      {/* Server renders cards+table with exact classes as reference HTML */}
      <div
        className="wrap"
        onBlurCapture={async (e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' && t.classList.contains('cell')) {
            const inp = t as HTMLInputElement;
            const rowId = inp.getAttribute('data-row');
            const weekId = inp.getAttribute('data-wid');
            if (rowId && weekId) {
              const value = parseFloat(inp.value || '0');
              try { await editCell('positives', rowId, weekId, value); }
              catch { await editCell('negatives', rowId, weekId, value); }
              await load();
            }
          }
        }}
        onClick={onGridClick}
        dangerouslySetInnerHTML={{__html: html}}
      />
    </div>
  )
}