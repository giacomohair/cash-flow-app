-- ============================================================
-- Cash-Flow Forecaster — schema persistenza (Fase 3)
-- Modello: UN cash-flow privato per utente (model + prefs come JSONB).
-- Eseguire nel dashboard Supabase: SQL Editor -> New query -> Run.
-- ============================================================

-- Tabella: una riga per utente
create table if not exists public.cashflows (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  model      jsonb,
  prefs      jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: OBBLIGATORIA con dati reali
alter table public.cashflows enable row level security;

-- Ogni utente accede SOLO alla propria riga (user_id = auth.uid())
create policy "cashflows_select_own"
  on public.cashflows for select
  using (auth.uid() = user_id);

create policy "cashflows_insert_own"
  on public.cashflows for insert
  with check (auth.uid() = user_id);

create policy "cashflows_update_own"
  on public.cashflows for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cashflows_delete_own"
  on public.cashflows for delete
  using (auth.uid() = user_id);
