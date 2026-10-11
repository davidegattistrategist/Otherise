-- L'assistente impara dalle correzioni del trainer.
--
-- program_ai_drafts: ogni bozza di programma preparata dall'AI. Quando il
-- trainer pubblica, l'app confronta la bozza con il programma pubblicato e
-- salva cosa è stato corretto (solo staff).
--
-- app_settings.ai_lessons: le "lezioni" ricavate dalle correzioni (una per
-- riga), che l'AI legge a ogni bozza. Il titolare le vede e le può correggere.

create table if not exists public.program_ai_drafts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  content jsonb not null,
  -- la richiesta scritta dal trainer per questa bozza
  instruction text not null default '',
  created_at timestamptz not null default now(),
  -- confronto con il programma pubblicato
  compared_at timestamptz,
  rows_total int,
  rows_changed int,
  corrections text not null default '',
  -- quando le correzioni sono diventate lezioni
  learned_at timestamptz
);
create index if not exists program_ai_drafts_program_idx on public.program_ai_drafts (program_id, created_at desc);
create index if not exists program_ai_drafts_compared_idx on public.program_ai_drafts (compared_at desc) where compared_at is not null;

alter table public.program_ai_drafts enable row level security;
drop policy if exists program_ai_drafts_staff on public.program_ai_drafts;
create policy program_ai_drafts_staff on public.program_ai_drafts for all to authenticated
  using (public.is_staff() and (client_id is null or public.can_manage_client(client_id)))
  with check (public.is_staff() and (client_id is null or public.can_manage_client(client_id)));

revoke all on public.program_ai_drafts from anon;
grant select, insert, update, delete on public.program_ai_drafts to authenticated;
grant all on public.program_ai_drafts to service_role;

alter table public.app_settings add column if not exists ai_lessons text not null default '';
alter table public.app_settings add column if not exists ai_lessons_updated_at timestamptz;
