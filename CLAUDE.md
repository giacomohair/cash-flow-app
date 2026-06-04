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

## Domanda aperta da risolvere in Fase 0
Il workflow reale del proprietario inserisce ogni settimana un valore EFFETTIVO di
cassa a fine settimana ("Cassa a fine periodo"), ma in questo model l'EOP è calcolato
(bop+net) e la riconciliazione avviene tramite la riga Adjustment. Conferma col
proprietario se: (a) mantenere EOP calcolato + Adjustment manuale (design attuale),
oppure (b) consentire l'inserimento diretto di un EOP effettivo per settimana.
Non cambiare questo senza conferma.

## Glossario (IT ↔ codice)
Stipendio=Salary · Bonus annuale=Bonus · Mutuo=Mortgage · Asilo=Kindergarten ·
Spesa=Groceries · Governante=(da aggiungere come riga OUTFLOW) ·
Risparmi/Satispay=parte della cassa liquida · Cassa a inizio periodo=BOP ·
Cassa a fine periodo=EOP · Rettifica=Adjustment · Carte di credito=righe OUTFLOW.
