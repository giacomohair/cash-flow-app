# CLAUDE.md — Cash-Flow Forecaster

## Cos'è questo progetto
Web app di previsione del cash-flow familiare. Colonne = settimane (datate al
lunedì); righe = entrate, uscite, una riga manuale "Adjustment", e la Cassa a
inizio/fine di ogni settimana. Nasce come prototipo single-file vanilla JS
(`cashflow-forecaster-v6e.html`), da trasformare in app multi-utente deployabile.

## Fonte di verità
`cashflow-forecaster-v6e.html` è la spec autorevole per business logic, data
model e UI. PORTALO, non ridisegnarlo. Se pensi che un comportamento vada
cambiato, FERMATI e chiedi.

## Stack (deciso — non proporre alternative se non richiesto)
- Frontend: mantieni l'attuale vanilla HTML/CSS/JS. Niente React/Vue/build framework.
- Auth + DB: Supabase (email/password). Postgres + Row Level Security.
- Hosting: deploy statico (Vercel o Netlify), pronto per dominio custom.
- VCS: git + GitHub, un commit per ogni fase completata.

## Data model (preservare ESATTAMENTE)
Oggetto `model`:
- `bop0`: number — cassa a inizio della prima settimana ("Cassa a inizio periodo" settimana 0).
- `weeks`: [{ id, start (ISO, lunedì), end (ISO, domenica) }]
- `positives`: righe di entrata (INFLOW)
- `negatives`: righe di uscita (OUTFLOW) — INCLUDE la riga "Savings" (locked) e la riga `isAdjustment`

Oggetto riga:
- `id` (string), `name` (string), `type` ('INFLOW'|'OUTFLOW')
- `recur?`: { kind:'WEEKLY'|'BIWEEKLY'|'MONTHLY'|'CUSTOM', every:number, amount:number } — amount negativo per le uscite
- `values`: { [weekId]: number } — importi reali per settimana (questo è il dato vero)
- `locked?`: bool — non cancellabile / ricorrenza non editabile (es. Savings)
- `isAdjustment?`: bool — la riga di rettifica manuale settimanale

Oggetto `prefs` (stato UI, key localStorage `cf_v6e_prefs`):
{ gran:'WEEK'|'MONTH'|'QUARTER'|'YEAR', collapsed:{}, eopThreshold:number, start, end, activeTab }

Key localStorage attuali: model=`cf_v6e_model`, prefs=`cf_v6e_prefs`.

## Funzioni chiave (non rileggere tutto il file; rispetta questi contratti)
- `makeWeeks(n, startDate)` / `weeksFromDates(startISO, endISO)`: settimane con inizio al lunedì.
- `materialize(model)`: riempie `values` dalle regole `recur`, ma NON sovrascrive MAI una
  cella che ha già un valore diverso da zero (le modifiche manuali vincono). Preserva questo.
- `totalsByWeek(model)` → per settimana { pos, neg, net, bop, eop, runSav }.
  bop(settimana0)=model.bop0; bop(settimana i)=eop(settimana i-1); eop=bop+net.
  È la logica Cassa inizio/fine periodo. EOP è CALCOLATO, non memorizzato.
- `buildPeriods(model, gran)`: raggruppa le settimane per le viste WEEK/MONTH/QUARTER/YEAR.
- `save`/`load`: lo strato localStorage da astrarre dietro `storage.js` e poi sostituire con Supabase.

## Target di persistenza (default — il più economico, preserva il model verbatim)
Salva l'intero `model` e `prefs` come JSONB, una riga per utente:
tabella `cashflows`(user_id uuid PK → auth.users, model jsonb, prefs jsonb, updated_at timestamptz).
RLS: un utente legge/scrive solo le righe dove user_id = auth.uid().
NON normalizzare in tabelle per-riga/per-cella se non te lo chiedo esplicitamente
(la scala "famiglia" non lo giustifica).

## Regole non negoziabili
- Porta, non reinventare. Riusa la logica esistente verbatim dove possibile.
- Nessuna feature nuova oltre a quanto specificato. Nessuna test suite se non richiesta.
- Unica dipendenza aggiunta: il client JS di Supabase.
- Una fase per sessione; commit a fine fase; poi STOP con riassunto in 5 righe.
- Mai committare segreti. URL/anon key Supabase via env/config; la service-role key MAI nel frontend.
- Con dati finanziari reali, la RLS è obbligatoria prima di qualsiasi deploy.

## Domanda aperta — RISOLTA in Fase 0 (proprietario, 2026-06-04)
Decisione: opzione (b) — consentire l'inserimento diretto di un EOP EFFETTIVO per
settimana. La riga EoP della tabella diventa editabile.

VINCOLO sull'implementazione (parsimonia): NON aggiungere campi al data model e NON
memorizzare l'EOP. Quando l'utente digita un EoP effettivo per la settimana i, si
calcola a ritroso il valore della riga Adjustment esistente:
  Adjustment.values[i] = EoP_target − bop(i) − (net della settimana i ESCLUSO Adjustment)
dove bop(i) = eop(i-1) (la catena di `totalsByWeek` resta identica). Quindi EOP rimane
CALCOLATO (bop+net) e l'Adjustment continua a portare il dato verbatim: il model è
preservato esattamente, cambia solo la UI (cella EoP editabile → back-solve su Adjustment)
e si ricalcola a valle. Implementazione prevista come step dedicato DOPO il refactor
Fase 1 (il refactor puro deve restare verificabile a comportamento identico).

## Glossario (IT ↔ codice)
Stipendio=Salary · Bonus annuale=Bonus · Mutuo=Mortgage · Asilo=Kindergarten ·
Spesa=Groceries · Governante=(da aggiungere come riga OUTFLOW) ·
Risparmi/Satispay=parte della cassa liquida · Cassa a inizio periodo=BOP ·
Cassa a fine periodo=EOP · Rettifica=Adjustment · Carte di credito=righe OUTFLOW.

## Stato deploy (vivo)
Produzione: https://cash-flow-app-eight.vercel.app (Vercel, auto-deploy su push a `main`).
UI a 2 viste: "Dashboard" (date + KPI) e "Cash-flow view and data input" (tabella +
pannello Settings). Nome app mostrato: "My cash-flow". Nuovi utenti partono da
`emptyModel()` (nessuna voce, solo Savings/Adjustment). "Confirm email" disattivato per
i test.

## Backlog (da fare)
1. **EoP effettivo** (deciso in Fase 0): riga EoP editabile → back-solve su Adjustment,
   senza toccare il data model. Unica feature funzionale ancora aperta.
2. **Sezione "Data input" separata**: schermata dedicata SOLO all'inserimento dei dati,
   distinta da "Cash-flow view and data input" (che resta la vista tabellare). Deve essere
   MOLTO mobile-friendly — pensata per un uso settimanale rapido da telefono. L'inserimento
   qui aggiorna le altre viste.
3. **Sezione "How to"**: guida d'uso in-app dell'applicazione.
4. **Conferma email in produzione**: riattivarla quando c'è un SMTP (es. Resend),
   altrimenti registrazioni con email finte.
5. **OTP / login con codice via email** (rinviato in Fase 2.5): richiede lo stesso SMTP.
6. **Opzionali**: dominio personalizzato; registrazione ristretta (uso familiare);
   rimuovere/spostare il prototipo `cashflow-forecaster-v6e.html` in `docs/`.
