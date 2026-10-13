-- Registro del backup notturno: lo scrive il backup su GitHub alla fine (riuscito
-- o no), con lo spazio usato da database e file; al mattino i controlli
-- giornalieri ne fanno una notifica al titolare. Lo legge solo il titolare.
create table if not exists public.backup_runs (
  id bigint generated always as identity primary key,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  tables integer,
  db_bytes bigint,
  files_bytes bigint,
  message text not null default ''
);

alter table public.backup_runs enable row level security;

drop policy if exists backup_runs_owner_read on public.backup_runs;
create policy backup_runs_owner_read on public.backup_runs
  for select using (public.is_owner());

-- nessuno dall'app ci scrive: solo il backup (con la connessione al database) e il server
revoke insert, update, delete on public.backup_runs from anon, authenticated;

create index if not exists backup_runs_finished_idx on public.backup_runs (finished_at desc);
