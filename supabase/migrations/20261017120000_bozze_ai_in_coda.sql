-- Bozze AI in coda: il trainer dà le indicazioni per la bozza di un programma
-- e può passare subito a un altro cliente; l'AI lavora sul server e la bozza
-- resta qui finché il trainer non la apre (o la scarta). Una riga per richiesta.
--
-- status: working (l'AI sta lavorando), questions (l'AI ha qualche domanda),
-- ready (bozza pronta), failed (non riuscita), applied (aperta nell'editor),
-- discarded (scartata). Ogni trainer vede solo le sue richieste.

create table if not exists public.ai_program_jobs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'working' check (status in ('working', 'questions', 'ready', 'failed', 'applied', 'discarded')),
  -- richiesta (indicazioni, risposte, programma di partenza; le foto no)
  request jsonb not null default '{}'::jsonb,
  -- il programma com'era quando hai chiesto la bozza (per avvisare se nel frattempo è cambiato)
  base_updated_at timestamptz,
  -- domande dell'AI oppure la bozza (summary, title, description, weeks, content, notes, sessionMinutes)
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  closed_at timestamptz
);
create index if not exists ai_program_jobs_mine_idx on public.ai_program_jobs (created_by, created_at desc);
create index if not exists ai_program_jobs_program_idx on public.ai_program_jobs (program_id, created_at desc);
create index if not exists ai_program_jobs_client_idx on public.ai_program_jobs (client_id);
-- una sola bozza in preparazione per programma: niente risposte che si scavalcano
create unique index if not exists ai_program_jobs_one_working on public.ai_program_jobs (program_id) where status = 'working';

alter table public.ai_program_jobs enable row level security;
drop policy if exists ai_program_jobs_own on public.ai_program_jobs;
create policy ai_program_jobs_own on public.ai_program_jobs for all to authenticated
  using ((select public.is_staff())
         and created_by = (select auth.uid())
         and ((select public.is_owner()) or client_id in (select public.my_coached_clients())))
  with check ((select public.is_staff())
              and created_by = (select auth.uid())
              and ((select public.is_owner()) or client_id in (select public.my_coached_clients())));

revoke all on public.ai_program_jobs from anon;
grant select, insert, update, delete on public.ai_program_jobs to authenticated;
grant all on public.ai_program_jobs to service_role;
