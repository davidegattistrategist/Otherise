-- Storico importato dai fogli e da Notion: fasi e check passati di cui si
-- conosce solo l'ordine, non la data.
--
-- Programmi: la data di inizio resta obbligatoria solo per i programmi
-- pubblicati (quelli che il cliente segue); le fasi passate possono non averla.
alter table public.programs drop constraint if exists programs_published_has_start;
alter table public.programs add constraint programs_published_has_start check (status <> 'published' or start_date is not null);

-- Check: la data può mancare; "sequence" è il numero del check nello storico
-- importato (Check 1, Check 2…) e serve per l'ordine.
alter table public.checks alter column check_date drop not null;
alter table public.checks add column if not exists sequence int check (sequence is null or sequence > 0);

-- il cliente vede solo i check con la data (quelli senza data sono appunti dello storico)
create or replace function public.my_checks()
returns table (
  id uuid,
  check_date date,
  weight_kg numeric,
  body_fat_pct numeric,
  fat_mass_kg numeric,
  lean_mass_kg numeric,
  circumferences jsonb,
  strength_tests jsonb,
  tests_text text
) language sql stable security definer set search_path = public as $$
  select id, check_date, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, circumferences, strength_tests, tests_text
  from public.checks
  where client_id = public.my_client_id() and visible_to_client and check_date is not null
  order by check_date
$$;
