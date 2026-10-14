-- =====================================================================
-- 1) Bozze salvate da sole mentre si scrive (check, programmi, chat, note…):
--    una riga per persona e per modulo. Se si chiude l'app o salta la rete
--    non si perde niente, e la bozza si ritrova anche sull'altro dispositivo
--    (modalità check tra telefono e computer). Ognuno vede solo le proprie.
-- =====================================================================
create table if not exists public.drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.drafts enable row level security;

drop policy if exists drafts_own on public.drafts;
create policy drafts_own on public.drafts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.drafts from anon;
grant select, insert, update, delete on public.drafts to authenticated;
grant all on public.drafts to service_role;

create index if not exists drafts_updated_idx on public.drafts (updated_at);

-- =====================================================================
-- 2) Il cliente vede anche le sue pliche nei progressi (per confrontarle):
--    my_checks restituisce in più le pliche e la loro somma.
-- =====================================================================
drop function if exists public.my_checks();
create function public.my_checks()
returns table (
  id uuid,
  check_date date,
  weight_kg numeric,
  body_fat_pct numeric,
  fat_mass_kg numeric,
  lean_mass_kg numeric,
  circumferences jsonb,
  strength_tests jsonb,
  tests_text text,
  skinfolds jsonb,
  skinfold_sum_mm numeric
) language sql stable security definer set search_path = public as $$
  select id, check_date, weight_kg, body_fat_pct, fat_mass_kg, lean_mass_kg, circumferences, strength_tests, tests_text, skinfolds, skinfold_sum_mm
  from public.checks
  where client_id = public.my_client_id() and public.is_client_self(client_id)
    and visible_to_client and check_date is not null
  order by check_date
$$;
