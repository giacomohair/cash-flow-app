-- =====================================================================
-- Cash-flow app — SEED dati di esempio (Fase 1)
-- Esegui DOPO 0001_init.sql e DOPO aver creato i 2 utenti in
-- Supabase Dashboard > Authentication > Users.
--
-- PRIMA di eseguire: sostituisci le 2 email qui sotto con quelle reali
-- dei due utenti creati (Giacomo ed Elena).
-- =====================================================================

-- >>> MODIFICA QUI <<<
\set email_jack  'giacomo.capelli@miroglio.com'
\set email_elena 'elena@example.com'

-- Household condiviso (id fisso così il seed è ri-eseguibile senza duplicati).
insert into public.households (id, name)
values ('00000000-0000-0000-0000-0000000c0001', 'Famiglia Capelli')
on conflict (id) do nothing;

-- Collega i due utenti (lookup per email su auth.users).
insert into public.household_members (household_id, user_id, role)
select '00000000-0000-0000-0000-0000000c0001', u.id, 'member'
from auth.users u
where u.email in (:'email_jack', :'email_elena')
on conflict (household_id, user_id) do nothing;

-- Categorie (entrate/uscite).
insert into public.categories (id, household_id, kind, name, position) values
  ('00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-0000000c0001', 'entrate', 'Jack',             0),
  ('00000000-0000-0000-0000-0000000ca002', '00000000-0000-0000-0000-0000000c0001', 'entrate', 'Elena',            1),
  ('00000000-0000-0000-0000-0000000ca003', '00000000-0000-0000-0000-0000000c0001', 'uscite',  'Costi fissi casa', 0)
on conflict (id) do nothing;

-- Voci.
insert into public.items (id, household_id, category_id, name, position) values
  ('00000000-0000-0000-0000-000000017001', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000ca001', 'Fisso Jack',  0),
  ('00000000-0000-0000-0000-000000017002', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000ca002', 'Fisso Elena', 0),
  ('00000000-0000-0000-0000-000000017003', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000ca003', 'Mutuo',       0),
  ('00000000-0000-0000-0000-000000017004', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000ca003', 'Asilo',       1)
on conflict (id) do nothing;

-- Valori settimanali: 3 settimane (lunedì 18/05, 25/05, 01/06 2026).
-- entrate positive, uscite negative; previsto (planned) + effettivo (actual).
insert into public.weekly_values (household_id, item_id, week_start, planned, actual, note) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000017003', '2026-05-18', -415.00,  -415.00, 'Mutuo'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000017004', '2026-05-18', -1500.00, NULL,    'Asilo'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000017002', '2026-05-25', 2700.00,  2700.00, 'Stipendio Elena'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000017001', '2026-06-01', 3500.00,  NULL,    'Stipendio Jack'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-000000017004', '2026-06-01', -1500.00, NULL,    'Asilo')
on conflict (item_id, week_start) do nothing;
