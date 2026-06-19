// Supabase Edge Function: "account"
// Permette all'utente autenticato di CANCELLARE il proprio account.
// La cancellazione dell'utente in auth.users richiede la service-role (solo lato server):
// i dati collegati (cashflows, bank_connections) hanno ON DELETE CASCADE, quindi si
// rimuovono automaticamente.
//
// Deploy: dashboard Supabase -> Edge Functions -> New function "account" -> incolla questo file.
// Nessun secret aggiuntivo: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// sono iniettati automaticamente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    // Identifica l'utente dal suo JWT.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action !== 'delete') return json({ error: 'unknown_action' }, 400);

    // Cancella l'utente con la service-role (cascade su cashflows / bank_connections).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return json({ error: 'delete_failed', detail: error.message }, 500);
    return json({ deleted: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
