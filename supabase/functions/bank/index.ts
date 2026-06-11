// Supabase Edge Function: "bank"
// Proxy sicuro verso TrueLayer Data API. Le chiavi (TL_CLIENT_ID/TL_CLIENT_SECRET)
// vivono SOLO qui come secret della function, mai nel frontend.
//
// Azioni (POST JSON { action, ... }):
//   connect  { redirectUri }            -> { url }            link di consenso (OAuth+SCA)
//   callback { code, redirectUri }      -> { connected, accounts }  scambia il code, salva la connessione
//   balance  {}                         -> { balance, currency }    legge il saldo del conto collegato
//   status   {}                         -> { connected }
//
// Host/provider configurabili via env per passare da sandbox a produzione senza toccare il codice:
//   TL_ENV=sandbox|live   TL_PROVIDERS="uk-cs-mock"   (in produzione: provider IT/EU)
//
// Deploy: dashboard Supabase -> Edge Functions -> New function "bank" -> incolla questo file.
// Secret: TL_CLIENT_ID, TL_CLIENT_SECRET (+ opz. TL_ENV, TL_PROVIDERS).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const ENVN = Deno.env.get('TL_ENV') || 'sandbox';
const AUTH = ENVN === 'live' ? 'https://auth.truelayer.com' : 'https://auth.truelayer-sandbox.com';
const API  = ENVN === 'live' ? 'https://api.truelayer.com'  : 'https://api.truelayer-sandbox.com';
const PROVIDERS = Deno.env.get('TL_PROVIDERS') || 'uk-cs-mock';
const CLIENT_ID = Deno.env.get('TL_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('TL_CLIENT_SECRET') || '';

async function tlToken(params: Record<string, string>) {
  const res = await fetch(`${AUTH}/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'server_not_configured' }, 500);

    // Identifica l'utente Supabase dalla sua sessione (JWT nell'Authorization header).
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'providers') {
      const country = String(body.country || 'it').toLowerCase();
      const tok = await tlToken({ grant_type: 'client_credentials', scope: 'info accounts balance' });
      if (!tok.access_token) return json({ error: 'cc_token_failed', detail: tok }, 400);
      const res = await fetch(`${API}/data/v1/providers`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const data = await res.json().catch(() => null);
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.providers ?? []);
      if (!res.ok || !Array.isArray(arr)) return json({ error: 'providers_failed', status: res.status, detail: data }, 400);
      const list = arr
        .filter((p: any) => {
          const c = (p.country || '').toLowerCase();
          const cs = Array.isArray(p.countries) ? p.countries.map((x: string) => String(x).toLowerCase()) : [];
          return !country || c === country || cs.includes(country);
        })
        .map((p: any) => ({ id: p.provider_id || p.id, name: p.display_name || p.name || p.provider_id }))
        .filter((p: any) => p.id);
      return json({ providers: list, env: ENVN, total: arr.length });
    }

    if (action === 'connect') {
      const redirectUri = String(body.redirectUri || '');
      const provider = body.providerId ? String(body.providerId) : PROVIDERS;
      const state = 'tlbank_' + crypto.randomUUID();
      const url = `${AUTH}/?response_type=code`
        + `&client_id=${encodeURIComponent(CLIENT_ID)}`
        + `&scope=${encodeURIComponent('info accounts balance offline_access')}`
        + `&redirect_uri=${encodeURIComponent(redirectUri)}`
        + `&providers=${encodeURIComponent(provider)}`
        + `&state=${encodeURIComponent(state)}`;
      return json({ url, state, env: ENVN, authHost: AUTH });
    }

    if (action === 'callback') {
      const code = String(body.code || '');
      const redirectUri = String(body.redirectUri || '');
      const tok = await tlToken({ grant_type: 'authorization_code', redirect_uri: redirectUri, code });
      if (!tok.access_token) return json({ error: 'token_exchange_failed', detail: tok }, 400);
      const accts = await fetch(`${API}/data/v1/accounts`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json());
      const account_id = accts.results?.[0]?.account_id ?? null;
      const { error } = await supabase.from('bank_connections').upsert({
        user_id: user.id, provider: 'truelayer', account_id,
        refresh_token: tok.refresh_token ?? null, connected_at: new Date().toISOString(),
      });
      if (error) return json({ error: 'db_error', detail: error.message }, 500);
      return json({ connected: true, accounts: accts.results ?? [] });
    }

    if (action === 'status') {
      const { data } = await supabase.from('bank_connections').select('account_id').eq('user_id', user.id).maybeSingle();
      return json({ connected: !!data?.account_id });
    }

    if (action === 'balance') {
      const { data: conn } = await supabase.from('bank_connections').select('account_id, refresh_token').eq('user_id', user.id).maybeSingle();
      if (!conn?.account_id || !conn?.refresh_token) return json({ error: 'not_connected' }, 400);
      const tok = await tlToken({ grant_type: 'refresh_token', refresh_token: conn.refresh_token });
      if (!tok.access_token) return json({ error: 'refresh_failed', detail: tok }, 400);
      if (tok.refresh_token && tok.refresh_token !== conn.refresh_token) {
        await supabase.from('bank_connections').update({ refresh_token: tok.refresh_token }).eq('user_id', user.id);
      }
      const bal = await fetch(`${API}/data/v1/accounts/${conn.account_id}/balance`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json());
      const b = bal.results?.[0];
      if (!b) return json({ error: 'no_balance', detail: bal }, 400);
      return json({ balance: b.current ?? b.available ?? null, currency: b.currency ?? null });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
