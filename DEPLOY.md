# Deploy — Cash-Flow Forecaster

**Produzione (live):** https://cash-flow-app-eight.vercel.app

Sito **statico** (HTML/CSS/JS, nessuno step di build), pubblicato su Vercel collegato al
repo GitHub: ogni `git push` su `main` ridistribuisce in automatico. Le chiavi Supabase
sono già in `js/config.js` (la publishable/anon key è pubblica per design):
**nessuna variabile d'ambiente** da impostare.

## Deploy su Vercel (consigliato)

1. Vai su https://vercel.com e accedi con GitHub.
2. **Add New… → Project** → importa il repo `giacomohair/cash-flow-app`.
3. Impostazioni progetto:
   - **Framework Preset**: `Other`
   - **Build Command**: *(lascia vuoto)*
   - **Output Directory**: *(lascia vuoto — serve la root)*
   - **Root Directory**: `./`
4. **Deploy**. Al termine ottieni un URL tipo `https://cash-flow-app.vercel.app`.
5. Ogni `git push` su `main` ridistribuisce in automatico.

`vercel.json` è già incluso (`cleanUrls`), non serve altro.

## Alternativa: Netlify

1. https://app.netlify.com → **Add new site → Import from GitHub** → seleziona il repo.
2. **Build command**: vuoto · **Publish directory**: `.` (root) → **Deploy**.

## Dominio personalizzato

Su **Vercel**: Project → **Settings → Domains** → *Add* il tuo dominio (es. `cashflow.tuodominio.it`).
Vercel mostra i record DNS da creare dal tuo registrar:
- dominio "apex" (`tuodominio.it`) → record **A** verso l'IP indicato da Vercel, **oppure**
- sottodominio (`cashflow.…`) → record **CNAME** verso `cname.vercel-dns.com`.

Il certificato HTTPS viene emesso automaticamente.

## Configurazione Supabase per la produzione

Quando il sito è online, nel dashboard Supabase:

1. **Authentication → URL Configuration**
   - **Site URL**: `https://cash-flow-app-eight.vercel.app` (aggiorna quando colleghi un dominio).
   - **Redirect URLs**: `https://cash-flow-app-eight.vercel.app/**` e `http://localhost:8000/**`
     (serve quando attiverai conferma email / OTP / magic link).
2. **Email/SMTP** (per riattivare conferma email e l'OTP rinviato): configura un SMTP
   proprio in **Authentication → SMTP Settings** (es. Resend free tier), poi puoi
   riattivare "Confirm email" e l'accesso con codice senza i limiti del tier gratuito.
3. Verifica che la **RLS** sia attiva su `cashflows` (lo è dallo `supabase/schema.sql` della Fase 3).

> Sicurezza: nel frontend va SOLO la publishable/anon key. La `service_role`/secret key
> non deve mai finire nel repo né nel browser.
