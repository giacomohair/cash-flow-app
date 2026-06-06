// ===== Storage layer =====
// Astrae la persistenza dietro un'interfaccia async load()/save().
// Implementazione attuale: localStorage (chiavi invariate cf_v6e_model / cf_v6e_prefs).
// In Fase 3 questo file verrà sostituito da un backend Supabase MANTENENDO la stessa
// interfaccia, senza toccare app.js.
//
//   await storage.load()            -> { model, prefs }  (null se assenti)
//   await storage.save({ model })   -> persiste solo il model
//   await storage.save({ prefs })   -> persiste solo le prefs
//   await storage.save({ model, prefs }) -> persiste entrambi
const LS_KEY = 'cf_v6e_model';
const PREFS  = 'cf_v6e_prefs';

const storage = {
  async load(){
    let model = null, prefs = null;
    try { const v = localStorage.getItem(LS_KEY);  model = v ? JSON.parse(v) : null; } catch { model = null; }
    try { const v = localStorage.getItem(PREFS);   prefs = v ? JSON.parse(v) : null; } catch { prefs = null; }
    return { model, prefs };
  },
  async save({ model, prefs } = {}){
    if (model !== undefined) localStorage.setItem(LS_KEY, JSON.stringify(model));
    if (prefs !== undefined) localStorage.setItem(PREFS,  JSON.stringify(prefs));
  }
};

window.storage = storage;
