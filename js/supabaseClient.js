// ===== Client Supabase condiviso =====
// Crea window.sb dalla config. Richiede che la libreria supabase-js (UMD, via CDN)
// e config.js siano già caricati prima di questo file.
const { createClient } = window.supabase;
window.sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
