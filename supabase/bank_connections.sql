-- ============================================================
-- Integrazione bancaria (backlog #8) — link conto per utente
-- Una connessione per utente (v1). Dati sensibili: protetti da RLS
-- (ogni utente vede/scrive solo la propria riga). Eseguire nel
-- dashboard Supabase: SQL Editor -> New query -> Run.
-- ============================================================

create table if not exists public.bank_connections (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  provider      text,
  account_id    text,
  refresh_token text,          -- token di sola lettura del conto (sensibile)
  connected_at  timestamptz not null default now()
);

alter table public.bank_connections enable row level security;

create policy "bank_select_own" on public.bank_connections for select using (auth.uid() = user_id);
create policy "bank_insert_own" on public.bank_connections for insert with check (auth.uid() = user_id);
create policy "bank_update_own" on public.bank_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bank_delete_own" on public.bank_connections for delete using (auth.uid() = user_id);
