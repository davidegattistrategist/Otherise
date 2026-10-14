-- =====================================================================
-- Allenamenti liberi: quello che il cliente fa fuori dal programma (pesi per
-- conto suo, una lezione di spinning, una corsa, un circuito, una partita…). Si segna in
-- pochi secondi: cosa, quanto, com'era, quando, una nota se vuole.
-- Il cliente vede e cambia solo i suoi (finché il percorso è attivo); lo
-- staff che lo segue li vede (e li può correggere). Contano come attività:
-- chi si allena così non finisce tra i "Da sentire".
-- =====================================================================
create table if not exists public.free_workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  performed_on date not null default current_date,
  kind text not null check (kind in ('pesi', 'spinning', 'bici', 'corsa', 'camminata', 'circuito', 'nuoto', 'sport', 'yoga', 'altro')),
  minutes int check (minutes between 1 and 600),
  effort smallint check (effort between 1 and 3),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists free_workouts_client_idx on public.free_workouts (client_id, performed_on desc);

alter table public.free_workouts enable row level security;

drop policy if exists free_workouts_client on public.free_workouts;
create policy free_workouts_client on public.free_workouts for all to authenticated
  using (public.is_client_self(client_id))
  with check (
    public.is_client_self(client_id)
    and performed_on between current_date - 60 and current_date + 1
  );

drop policy if exists free_workouts_staff on public.free_workouts;
create policy free_workouts_staff on public.free_workouts for all to authenticated
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

revoke all on public.free_workouts from anon;
grant select, insert, update, delete on public.free_workouts to authenticated;
grant all on public.free_workouts to service_role;
