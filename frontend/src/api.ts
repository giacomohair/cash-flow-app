const API = import.meta.env.VITE_API || 'http://localhost:8000'
let token: string | null = null
export function setToken(t:string){ token=t }
function auth(){ return token ? { 'Authorization':'Bearer '+token } : {} }

export async function register(email:string,password:string){
  const res = await fetch(`${API}/api/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({email,password})})
  if(!res.ok) throw new Error(await res.text()); const d = await res.json(); setToken(d.access_token); return d
}
export async function login(email:string,password:string){
  const form = new URLSearchParams(); form.set('username',email); form.set('password',password)
  const res = await fetch(`${API}/api/auth/login`,{method:'POST',body:form})
  if(!res.ok) throw new Error(await res.text()); const d = await res.json(); setToken(d.access_token); return d
}
export async function getSettings(){ const r=await fetch(`${API}/api/settings`,{headers:{...auth()}}); if(!r.ok) throw new Error(await r.text()); return await r.json() }
export async function setSettings(s:any){ const r=await fetch(`${API}/api/settings`,{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body: JSON.stringify(s)}); if(!r.ok) throw new Error(await r.text()); return await r.json() }
export async function renderView(){ const r=await fetch(`${API}/api/view/render`,{headers:{...auth()}}); if(!r.ok) throw new Error(await r.text()); return await r.json() as {html:string, settings:any} }
export async function editCell(section:'positives'|'negatives',rowId:string,weekId:string,value:number){
  const r=await fetch(`${API}/api/cell/edit`,{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body: JSON.stringify({section,row_id:rowId,week_id:weekId,value})}); if(!r.ok) throw new Error(await r.text()); return await r.json()
}
export async function addItem(section:'positives'|'negatives', name:string, type:'INFLOW'|'OUTFLOW', amount:number, recur_kind?:string, every?:number){
  const r=await fetch(`${API}/api/items/add`,{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body: JSON.stringify({section,name,type,amount,recur_kind,every})}); if(!r.ok) throw new Error(await r.text()); return await r.json()
}
export async function delItem(section:'positives'|'negatives', rowId:string){
  const r=await fetch(`${API}/api/items/delete`,{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body: JSON.stringify({section,row_id:rowId})}); if(!r.ok) throw new Error(await r.text()); return await r.json()
}
export async function setRecurrence(section:'positives'|'negatives', rowId:string, amount:number, recur_kind:string, every?:number){
  const r=await fetch(`${API}/api/items/recurrence`,{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body: JSON.stringify({section,row_id:rowId,amount,recur_kind,every})}); if(!r.ok) throw new Error(await r.text()); return await r.json()
}
export async function applyDates(start:string,end:string){
  const r=await fetch(`${API}/api/dates/apply`,{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body: JSON.stringify({start,end})}); if(!r.ok) throw new Error(await r.text()); return await r.json()
}
