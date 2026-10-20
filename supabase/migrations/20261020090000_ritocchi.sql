-- Ritocchi dei programmi in corso e limitazioni temporanee del cliente.
--
-- 1) program_revisions: ogni volta che si salva un programma pubblicato e già
--    iniziato si conserva la versione di prima (con il motivo), così un
--    ritocco si può sempre annullare ("Ritocchi" nell'editor). Solo lo staff
--    che segue il cliente; il cliente non le vede. Al massimo 30 per programma.
-- 2) client_ai_profiles.limitation / limitation_until: una limitazione
--    temporanea (es. "non può usare la mano sinistra") che l'AI rispetta nei
--    ritocchi e nelle bozze finché non scade.

create table if not exists public.program_revisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- perché è cambiato ("Ritocco con l'AI: troppo facile", "Modifica a mano"…)
  reason text not null default '' check (length(reason) <= 500),
  -- il programma com'era PRIMA della modifica
  title text not null default '',
  weeks int not null check (weeks between 1 and 12),
  content jsonb not null
);

create index if not exists program_revisions_program on public.program_revisions (program_id, created_at desc);
create index if not exists program_revisions_client on public.program_revisions (client_id);

alter table public.program_revisions enable row level security;
drop policy if exists program_revisions_staff on public.program_revisions;
create policy program_revisions_staff on public.program_revisions for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

revoke all on public.program_revisions from anon, authenticated;
grant select, insert, delete on public.program_revisions to authenticated;
grant all on public.program_revisions to service_role;

-- la revisione deve essere dello stesso cliente del programma
create or replace function public.program_revisions_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.programs p where p.id = new.program_id and p.client_id = new.client_id) then
    raise exception 'programma di un altro cliente';
  end if;
  return new;
end $$;
drop trigger if exists program_revisions_check on public.program_revisions;
create trigger program_revisions_check before insert on public.program_revisions
  for each row execute function public.program_revisions_check();

-- al massimo 30 versioni per programma: le più vecchie se ne vanno
create or replace function public.program_revisions_trim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.program_revisions r
  where r.program_id = new.program_id
    and r.id not in (select id from public.program_revisions where program_id = new.program_id order by created_at desc limit 30);
  return null;
end $$;
drop trigger if exists program_revisions_trim on public.program_revisions;
create trigger program_revisions_trim after insert on public.program_revisions
  for each row execute function public.program_revisions_trim();

alter table public.client_ai_profiles add column if not exists limitation text not null default '' check (length(limitation) <= 500);
alter table public.client_ai_profiles add column if not exists limitation_until date;
