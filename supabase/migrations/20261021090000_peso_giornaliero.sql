-- Peso giorno per giorno (facoltativo): lo scrive il cliente in Progressi, lo
-- vede (e può correggerlo) lo staff che lo segue. Un valore per giorno: se il
-- cliente si ripesa lo stesso giorno, vale l'ultimo.
-- A fine percorso (cliente archiviato) il cliente non lo vede più, come il
-- resto del percorso; lo staff sì.

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  log_date date not null,
  kg numeric(5, 2) not null check (kg between 25 and 400),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, log_date)
);

create index if not exists weight_logs_client_date on public.weight_logs (client_id, log_date desc);

alter table public.weight_logs enable row level security;

drop policy if exists weight_logs_staff on public.weight_logs;
create policy weight_logs_staff on public.weight_logs for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

drop policy if exists weight_logs_client on public.weight_logs;
create policy weight_logs_client on public.weight_logs for all to authenticated
  using (client_id = (select public.my_active_client_id()))
  with check (client_id = (select public.my_active_client_id()));

revoke all on public.weight_logs from anon, authenticated;
grant select, insert, update, delete on public.weight_logs to authenticated;
grant all on public.weight_logs to service_role;

-- niente pesate nel futuro (ora italiana, con un giorno di margine per i fusi)
create or replace function public.weight_logs_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.log_date > (now() at time zone 'Europe/Rome')::date + 1 then
    raise exception 'data nel futuro';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists weight_logs_guard on public.weight_logs;
create trigger weight_logs_guard before insert or update on public.weight_logs
  for each row execute function public.weight_logs_guard();
