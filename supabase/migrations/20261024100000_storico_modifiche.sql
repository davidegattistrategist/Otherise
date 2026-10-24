-- Storico delle modifiche: la versione PRECEDENTE di ogni riga importante,
-- salvata da un trigger ogni volta che la riga cambia o viene cancellata.
--
-- Perché: il 23/10 un salvataggio automatico ha scritto una bozza vecchia sopra
-- un check (persi appunti e test di forza) e si è recuperato solo dal backup
-- della notte prima. Con questo storico una riga sovrascritta o cancellata si
-- rimette a posto in un minuto, da qui (SQL Editor), senza aspettare il backup.
--
-- Cosa conserva: check, schede dei clienti, indicazioni per l'AI, note
-- riservate, progetti, valutazioni posturali, sessioni PT, diari, allenamenti
-- (logbook e liberi), pesate, messaggi, pagamenti e piani, programmi.
-- Le cancellazioni sempre; le modifiche al massimo una ogni N minuti per riga
-- (il salvataggio automatico scrive a ogni lettera: si conserva com'era la
-- riga PRIMA della sessione di modifica, non ogni battuta).
-- Nessuno la legge dall'app: solo il titolare dal SQL Editor (service_role).
-- Pulizia dopo 90 giorni nei controlli del mattino (daily-checks).

create table if not exists public.row_history (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,
  op text not null check (op in ('update', 'delete')),
  changed_at timestamptz not null default now(),
  changed_by uuid,
  old_data jsonb not null
);
create index if not exists row_history_row on public.row_history (table_name, row_id, changed_at desc);
create index if not exists row_history_time on public.row_history (changed_at);

alter table public.row_history enable row level security;
-- nessuna policy: dall'app (anon, authenticated) non si legge né si scrive
revoke all on public.row_history from anon, authenticated;
revoke all on sequence public.row_history_id_seq from anon, authenticated;
grant all on public.row_history to service_role;
grant all on sequence public.row_history_id_seq to service_role;

-- Il trigger: TG_ARGV[0] = minuti minimi tra due versioni della stessa riga (0 = sempre).
create or replace function public.keep_row_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
  gap int := coalesce(nullif(TG_ARGV[0], '')::int, 0);
  prev jsonb;
  nxt jsonb;
begin
  prev := to_jsonb(old);
  rid := coalesce(prev->>'id', prev->>'client_id', prev->>'user_id', '?');
  if TG_OP = 'UPDATE' then
    nxt := to_jsonb(new);
    -- niente da conservare se è cambiata solo l'ora
    if (prev - 'updated_at' - 'last_read_at' - 'read_at') = (nxt - 'updated_at' - 'last_read_at' - 'read_at') then
      return null;
    end if;
    if gap > 0 and exists (
      select 1 from public.row_history h
      where h.table_name = TG_TABLE_NAME and h.row_id = rid and h.op = 'update'
        and h.changed_at > now() - make_interval(mins => gap)
    ) then
      return null;
    end if;
  end if;
  insert into public.row_history (table_name, row_id, op, changed_by, old_data)
  values (TG_TABLE_NAME, rid, lower(TG_OP), auth.uid(), prev);
  return null;
exception when others then
  -- lo storico non deve mai bloccare la modifica vera
  return null;
end $$;

revoke all on function public.keep_row_history() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('checks', '2'),
      ('clients', '2'),
      ('client_ai_profiles', '2'),
      ('client_private_notes', '2'),
      ('client_projects', '2'),
      ('posture_assessments', '2'),
      ('pt_sessions', '2'),
      ('checkins', '2'),
      ('free_workouts', '2'),
      ('weight_logs', '0'),
      ('workout_logs', '5'),
      ('exercise_logs', '5'),
      ('messages', '0'),
      ('payments', '0'),
      ('payment_plans', '0'),
      ('programs', '10'),
      ('exercises', '2')
    ) as v(name, gap)
  loop
    if to_regclass('public.' || t.name) is null then continue; end if;
    execute format('drop trigger if exists keep_history on public.%I', t.name);
    execute format('create trigger keep_history after update or delete on public.%I for each row execute function public.keep_row_history(%L)', t.name, t.gap);
  end loop;
end $$;

-- Pulizia (chiamata dai controlli del mattino con la service role).
create or replace function public.trim_row_history(keep_days int default 90)
returns int language sql security definer set search_path = public as $$
  with gone as (delete from public.row_history where changed_at < now() - make_interval(days => keep_days) returning 1)
  select count(*)::int from gone;
$$;
revoke all on function public.trim_row_history(int) from public, anon, authenticated;
grant execute on function public.trim_row_history(int) to service_role;

-- Come si recupera (esempio, dal SQL Editor):
--   select changed_at, op, old_data->>'notes_next_phase'
--   from public.row_history where table_name = 'checks' and row_id = '<id del check>' order by changed_at desc;
--   update public.checks set notes_next_phase = (select old_data->>'notes_next_phase' from public.row_history where id = <id della versione>) where id = '<id del check>';
