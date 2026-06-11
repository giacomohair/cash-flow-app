# Integrazione bancaria — setup (TrueLayer, sandbox)

Legge il **saldo** del conto via TrueLayer e lo usa per impostare l'"Actual cash now (EoP)".
Il frontend NON vede mai le chiavi: parla con la Edge Function `bank`, che custodisce i secret.

## 1) Tabella + RLS
Dashboard Supabase → **SQL Editor** → incolla ed esegui [`supabase/bank_connections.sql`](bank_connections.sql).

## 2) Deploy della Edge Function
Dashboard Supabase → **Edge Functions** → **Create function** → nome esatto **`bank`** →
incolla il contenuto di [`supabase/functions/bank/index.ts`](functions/bank/index.ts) → **Deploy**.
> Se ti chiede "Verify JWT": lascialo attivo (la function gestisce comunque l'utente dal token).

## 3) Secret della function
Dashboard Supabase → **Edge Functions → (bank) → Secrets** (o *Project Settings → Edge Functions → Secrets*) →
aggiungi:
- `TL_CLIENT_ID` = il client_id (sandbox) di TrueLayer
- `TL_CLIENT_SECRET` = il client_secret (sandbox)
- *(opzionali)* `TL_ENV=sandbox` (default) · `TL_PROVIDERS=uk-cs-mock` (banca finta sandbox)

`SUPABASE_URL`, `SUPABASE_ANON_KEY` sono iniettati in automatico — non aggiungerli.

## 4) Redirect URI su TrueLayer
Nella console TrueLayer (app **Data API**, **Sandbox**) imposta i Redirect URI **esatti** (senza slash finale):
- `https://cash-flow-app-eight.vercel.app`
- `http://localhost:8000`

## 5) Test in sandbox
1. Apri l'app → **Weekly data input** → **🏦 Sync from bank**.
2. Primo utilizzo: parte il consenso → scegli la **banca finta** sandbox → credenziali di test TrueLayer
   (es. utente `john`/`doe`, vedi docs TrueLayer Sandbox) → autorizza.
3. Torni all'app: "Bank connected ✓". Ripremi **Sync from bank** → il saldo riempie l'EoP
   (back-solve su Adjustment).

## Passaggio a produzione (dopo verifica ToS/go-live)
- Secret: `TL_ENV=live` + `client_id`/`client_secret` **di produzione** (diversi dalla sandbox);
  completa il "go-live" di TrueLayer (Italia è in **beta** sulla Data API).
- `TL_PROVIDERS`: in live il default è già **`it-ob-all`** (tutte le banche IT Open Banking).
  Per restringere/estendere usa il formato `paese-metodo-banca` (es. `it-ob-all`, `all-ob-revolut`).
- Elenco provider completo: `GET {AUTH}/api/providers` (la function lo usa per il selettore).
- Nessuna modifica al codice necessaria.

## Sicurezza
- Chiavi TrueLayer: solo come secret della function.
- `bank_connections` (incl. `refresh_token`): protetta da RLS per-utente. Valuta cifratura/retention
  prima dell'uso con conti reali.
