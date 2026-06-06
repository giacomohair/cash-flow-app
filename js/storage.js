// ===== Storage layer (Fase 3: Supabase) =====
// Stessa interfaccia async della versione localStorage:
//
//   await storage.load()                  -> { model, prefs }  (null se assenti)
//   await storage.save({ model })         -> persiste solo il model
//   await storage.save({ prefs })         -> persiste solo le prefs
//   await storage.save({ model, prefs })  -> persiste entrambi
//   await storage.flushNow()              -> invia subito eventuali salvataggi in coda
//
// Implementazione: tabella `cashflows` (una riga per utente, model/prefs JSONB),
// protetta da Row Level Security (user_id = auth.uid()). Richiede window.sb
// (client Supabase) già inizializzato.
//
// I salvataggi sono "fire-and-forget" e molto frequenti (una cella modificata =
// un save). Per evitare race condition e ridurre le richieste, accumuliamo lo stato
// e inviamo un solo upsert con l'ultimo stato dopo un breve debounce.

const SAVE_DEBOUNCE_MS = 500;
let pending = {};       // { model?, prefs? } accumulati in attesa di flush
let saveTimer = null;

async function currentUserId(){
  const { data: { session } } = await sb.auth.getSession();
  return session?.user?.id || null;
}

async function flush(){
  saveTimer = null;
  if(!('model' in pending) && !('prefs' in pending)) return;
  const payload = pending;
  pending = {};
  const uid = await currentUserId();
  if(!uid) return; // nessuna sessione: niente da salvare

  const row = { user_id: uid, updated_at: new Date().toISOString() };
  if('model' in payload) row.model = payload.model;
  if('prefs' in payload) row.prefs = payload.prefs;

  const { error } = await sb.from('cashflows').upsert(row, { onConflict: 'user_id' });
  if(error) console.error('Salvataggio cloud fallito:', error.message);
}

const storage = {
  async load(){
    const uid = await currentUserId();
    if(!uid) return { model: null, prefs: null };
    const { data, error } = await sb
      .from('cashflows')
      .select('model, prefs')
      .eq('user_id', uid)
      .maybeSingle();
    if(error){ console.error('Caricamento cloud fallito:', error.message); return { model: null, prefs: null }; }
    return { model: data?.model ?? null, prefs: data?.prefs ?? null };
  },

  async save({ model, prefs } = {}){
    if(model !== undefined) pending.model = model;
    if(prefs !== undefined) pending.prefs = prefs;
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  },

  async flushNow(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    await flush();
  }
};

window.storage = storage;
