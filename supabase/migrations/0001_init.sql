-- =====================================================================
-- Cash-flow app — Fase 1: schema minimo con household_id + RLS
-- Esegui questo file nel SQL Editor di Supabase (una volta sola).
-- =====================================================================

-- Bump automatico di updated_at (utile per il last-write-wins).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------
create table if not exists public.households (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  fiscal_year_start  date not null default date_trunc('year', now())::date,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- household_members: collega gli utenti di auth a un household
-- ---------------------------------------------------------------------
create table if not exists public.household_members (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member',
  created_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ---------------------------------------------------------------------
-- categories: livello "categoria" sotto il gruppo (entrate/uscite)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  kind          text not null check (kind in ('entrate', 'uscite')),
  name          text not null,
  position      int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists categories_household_idx on public.categories(household_id);

-- ---------------------------------------------------------------------
-- items: le "voci" (livello 3)
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  name          text not null,
  position      int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists items_household_idx on public.items(household_id);
create index if not exists items_category_idx on public.items(category_id);

-- ---------------------------------------------------------------------
-- weekly_values: valore previsto/effettivo per (voce, settimana)
-- week_start = data del LUNEDI della settimana
-- ---------------------------------------------------------------------
create table if not exists public.weekly_values (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  week_start    date not null,
  planned       numeric(12,2),
  actual        numeric(12,2),
  note          text,
  updated_at    timestamptz not null default now(),
  unique (item_id, week_start)
);
create index if not exists weekly_values_household_week_idx
  on public.weekly_values(household_id, week_start);

drop trigger if exists weekly_values_set_updated_at on public.weekly_values;
create trigger weekly_values_set_updated_at
  before update on public.weekly_values
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Row Level Security: TUTTO filtrato su household_id (membership)
-- =====================================================================
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.categories        enable row level security;
alter table public.items             enable row level security;
alter table public.weekly_values     enable row level security;

-- household_members: ogni utente vede solo le proprie righe di appartenenza.
drop policy if exists members_select_own on public.household_members;
create policy members_select_own on public.household_members
  for select using (user_id = auth.uid());

-- households: visibili ai membri.
drop policy if exists households_member_read on public.households;
create policy households_member_read on public.households
  for select using (
    id in (select household_id from public.household_members where user_id = auth.uid())
  );

-- categories / items / weekly_values: lettura+scrittura ai membri del loro household.
drop policy if exists categories_member_rw on public.categories;
create policy categories_member_rw on public.categories
  for all
  using      (household_id in (select household_id from public.household_members where user_id = auth.uid()))
  with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));

drop policy if exists items_member_rw on public.items;
create policy items_member_rw on public.items
  for all
  using      (household_id in (select household_id from public.household_members where user_id = auth.uid()))
  with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));

drop policy if exists weekly_values_member_rw on public.weekly_values;
create policy weekly_values_member_rw on public.weekly_values
  for all
  using      (household_id in (select household_id from public.household_members where user_id = auth.uid()))
  with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));
