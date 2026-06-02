# Cash-flow famiglia

Web app responsive per monitorare e prevedere il **cash-flow settimanale**
della famiglia. Sostituisce il vecchio Excel.

Stack: **Next.js (App Router) + TypeScript**, **Tailwind + shadcn/ui**,
**Supabase** (Auth + Postgres), deploy su **Vercel**.

Questa è la **Fase 1** (fetta verticale): login, un household condiviso,
valori settimanali di esempio (previsto/effettivo) che **entrambi gli utenti
vedono e modificano** sugli stessi dati.

---

## 1. Setup Supabase (una volta)

1. Crea un progetto su [supabase.com](https://supabase.com) (hosted, no Docker).
2. **Database** → SQL Editor → incolla ed esegui `supabase/migrations/0001_init.sql`
   (crea tabelle + Row Level Security).
3. **Authentication → Users → Add user**: crea manualmente i due utenti
   (Giacomo ed Elena) con email + password. _Niente registrazione pubblica._
4. Apri `supabase/seed.sql`, **sostituisci le due email** in alto con quelle
   reali dei due utenti, poi eseguilo nel SQL Editor (carica 3 settimane di
   esempio e collega i due utenti all'household).
5. **Project Settings → API**: copia `Project URL` e `anon public key`.

## 2. Avvio locale (desktop)

```bash
cp .env.example .env.local   # poi incolla URL e anon key dentro .env.local
npm install
npm run dev                  # http://localhost:3000
```

Accedi con una delle due utenze create al punto 1.3.

## 3. Provarla da mobile sulla stessa rete (LAN)

```bash
npm run dev:mobile           # equivale a: next dev -H 0.0.0.0
```

Poi trova l'IP locale del computer e aprilo dal telefono:

- **Windows (PowerShell):** `ipconfig` → voce "Indirizzo IPv4" (es. `192.168.1.42`)
- **WSL/Linux:** `hostname -I` (primo indirizzo) — oppure usa l'IP di Windows
- **macOS:** `ipconfig getifaddr en0`

Dal telefono (stessa rete Wi-Fi) apri: `http://<IP-del-PC>:3000`
Esempio: `http://192.168.1.42:3000`

> Se non si apre, controlla il firewall del PC (consenti la porta 3000) e che
> telefono e PC siano sulla stessa rete.

## 4. Deploy su Vercel (URL pubblico di anteprima)

1. Push del repo su GitHub.
2. Su [vercel.com](https://vercel.com): **Add New → Project → Import** del repo GitHub.
3. In **Environment Variables** aggiungi (per Production **e** Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Ogni push genera un deploy automatico; ottieni un URL pubblico
   (es. `https://cash-flow-app-xxxx.vercel.app`) da aprire dal telefono ovunque
   e da condividere con il secondo utente.

---

## Struttura

```
src/
  app/
    login/         # pagina di login (email/password) + server actions
    page.tsx       # home protetta: settimane di esempio, modifica "effettivo"
    actions.ts     # server action per salvare i valori
  lib/
    supabase/      # client browser, server e middleware (sessione)
    format.ts      # formattazione EUR / date in italiano
  proxy.ts         # protegge le rotte, refresh sessione (ex middleware)
supabase/
  migrations/      # schema SQL (tabelle + RLS)
  seed.sql         # dati di esempio
```

## Note

- **Sicurezza:** nessuna credenziale nel repo. Le chiavi stanno in `.env.local`
  (git-ignorato) e nelle Environment Variables di Vercel.
- **Concorrenza:** _last-write-wins_, nessun realtime. Ricarica la pagina per
  vedere le modifiche dell'altro utente.
- **Multi-tenant:** ogni tabella ha `household_id` con RLS già attiva, così il
  passaggio futuro a più household isolati non richiede riscrivere il modello.
