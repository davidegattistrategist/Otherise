-- =====================================================================
-- Controllo generale del 15/10.
-- 1) Letture "l'ultimo per cliente" fatte dal database: Supabase restituisce
--    al massimo 1000 righe per lettura, quindi leggere gli ultimi messaggi o
--    allenamenti di TUTTI i clienti e poi scegliere nel codice smette di
--    funzionare (in silenzio) quando i dati crescono.
-- 2) Record e massimali calcolati nel database invece di scaricare tutto lo
--    storico del logbook a ogni allenamento.
-- 3) Programmi per Oggi e Clienti senza scaricare il loro contenuto.
-- 4) Il cliente può solo segnare come lette le proprie notifiche e non può
--    toccare i campi dello staff nel logbook (visto, giudizio dell'AI).
-- 5) Un solo piano di pagamento attivo per cliente.
-- Tutte le funzioni lavorano con i permessi di chi le chiama (security
-- invoker): ognuno vede solo quello che vedrebbe già.
-- =====================================================================

-- 1a) Ultimo messaggio di ogni conversazione (con o senza quelli eliminati)
create or replace function public.last_messages(include_deleted boolean default true)
returns table (client_id uuid, created_at timestamptz, body text, attachments jsonb, deleted_at timestamptz, sender_id uuid)
language sql stable security invoker set search_path = public as $$
  select distinct on (m.client_id) m.client_id, m.created_at, m.body, m.attachments, m.deleted_at, m.sender_id
  from public.messages m
  where include_deleted or m.deleted_at is null
  order by m.client_id, m.created_at desc
$$;

-- 1b) Ultima attività di ogni cliente: allenamento del programma e allenamento libero
create or replace function public.last_activity()
returns table (client_id uuid, last_workout date, last_free date)
language sql stable security invoker set search_path = public as $$
  select c.id,
    (select max(w.performed_on) from public.workout_logs w where w.client_id = c.id),
    (select max(f.performed_on) from public.free_workouts f where f.client_id = c.id)
  from public.clients c
$$;

-- 1c) Ultimo check con la data di ogni cliente e se ne ha fatti nell'app (lo storico importato non conta)
create or replace function public.last_checks()
returns table (client_id uuid, last_check date, in_app boolean)
language sql stable security invoker set search_path = public as $$
  select k.client_id, max(k.check_date), bool_or(not k.imported)
  from public.checks k
  where k.check_date is not null
  group by k.client_id
$$;

-- 2a) Record per esercizio (serie migliore con il massimale stimato di Epley,
--     fino a 12 ripetizioni) e carico più alto, dal logbook prima di una data
create or replace function public.exercise_bests(cid uuid, before_date date default null)
returns table (name text, e1rm numeric, kg numeric, reps int, performed_on date, heaviest numeric)
language sql stable security invoker set search_path = public as $$
  with s as (
    select l.exercise_name, lower(btrim(l.exercise_name)) as k, l.performed_on,
           (x->>'kg')::numeric as kg, (x->>'reps')::numeric as reps
    from public.exercise_logs l
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.sets) = 'array' then l.sets else '[]'::jsonb end) x
    where l.client_id = cid
      and (before_date is null or l.performed_on < before_date)
      and jsonb_typeof(x->'kg') = 'number' and jsonb_typeof(x->'reps') = 'number'
      and (x->>'kg')::numeric > 0 and (x->>'reps')::numeric > 0
  ), e as (
    select *, case when reps = 1 then kg when reps between 2 and 12 and reps = trunc(reps) then round(kg * (1 + reps / 30) * 10) / 10 end as e1rm
    from s
  )
  select distinct on (k) exercise_name, e1rm, kg, reps::int, performed_on, max(kg) over (partition by k)
  from e
  order by k, coalesce(e1rm, 0) desc, performed_on desc, kg desc
$$;

-- 2b) Per i grafici: il massimale stimato migliore di ogni esercizio, giorno per giorno
create or replace function public.exercise_daily_best(cid uuid, since date)
returns table (name text, performed_on date, e1rm numeric, logs int)
language sql stable security invoker set search_path = public as $$
  with s as (
    select l.id, l.exercise_name, lower(btrim(l.exercise_name)) as k, l.performed_on,
           (x->>'kg')::numeric as kg, (x->>'reps')::numeric as reps
    from public.exercise_logs l
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.sets) = 'array' then l.sets else '[]'::jsonb end) x
    where l.client_id = cid and l.performed_on >= since
      and jsonb_typeof(x->'kg') = 'number' and jsonb_typeof(x->'reps') = 'number'
      and (x->>'kg')::numeric > 0 and (x->>'reps')::numeric > 0
  ), e as (
    select *, case when reps = 1 then kg when reps between 2 and 12 and reps = trunc(reps) then round(kg * (1 + reps / 30) * 10) / 10 end as e1rm
    from s
  )
  select (array_agg(exercise_name order by performed_on))[1], performed_on, max(e1rm), count(distinct id)::int
  from e
  where e1rm is not null
  group by k, performed_on
  order by k, performed_on
$$;

-- 3) Programmi in corso e bozze senza il contenuto (solo quanti giorni hanno)
create or replace function public.programs_overview(ids uuid[])
returns table (id uuid, client_id uuid, title text, weeks int, start_date date, status text, days_count int)
language sql stable security invoker set search_path = public as $$
  select p.id, p.client_id, p.title, p.weeks, p.start_date, p.status::text,
         coalesce(jsonb_array_length(case when jsonb_typeof(p.content->'days') = 'array' then p.content->'days' end), 0)
  from public.programs p
  where p.client_id = any(ids) and p.status in ('published', 'draft')
  order by p.start_date desc nulls last
$$;

revoke execute on function public.last_messages(boolean), public.last_activity(), public.last_checks(),
  public.exercise_bests(uuid, date), public.exercise_daily_best(uuid, date), public.programs_overview(uuid[]) from anon, public;
grant execute on function public.last_messages(boolean), public.last_activity(), public.last_checks(),
  public.exercise_bests(uuid, date), public.exercise_daily_best(uuid, date), public.programs_overview(uuid[]) to authenticated, service_role;

-- 4a) Notifiche: chi le riceve può solo segnarle come lette
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- 4b) Logbook: il cliente non può segnare "visto" un dolore o una nota, né
--     scrivere il giudizio dell'AI; può solo azzerarli (quando cambia il testo)
create or replace function public.guard_workout_log_staff_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.discomfort_seen_at := null;
    new.note_seen_at := null;
    new.note_flag := null;
    new.note_reason := '';
    return new;
  end if;
  if new.discomfort_seen_at is distinct from old.discomfort_seen_at and new.discomfort_seen_at is not null then
    new.discomfort_seen_at := old.discomfort_seen_at;
  end if;
  if new.note_seen_at is distinct from old.note_seen_at and new.note_seen_at is not null then
    new.note_seen_at := old.note_seen_at;
  end if;
  if new.note_flag is distinct from old.note_flag and new.note_flag is not null then
    new.note_flag := old.note_flag;
  end if;
  if new.note_reason is distinct from old.note_reason and new.note_reason <> '' then
    new.note_reason := old.note_reason;
  end if;
  return new;
end $$;
drop trigger if exists workout_logs_guard_staff_fields on public.workout_logs;
create trigger workout_logs_guard_staff_fields before insert or update on public.workout_logs
  for each row execute function public.guard_workout_log_staff_fields();

-- 5) Un solo piano attivo per cliente (se per sbaglio ce n'erano due, resta attivo il più recente)
update public.payment_plans p set active = false
where p.active and exists (
  select 1 from public.payment_plans q
  where q.client_id = p.client_id and q.active and q.id <> p.id
    and (q.created_at > p.created_at or (q.created_at = p.created_at and q.id > p.id))
);
create unique index if not exists payment_plans_one_active on public.payment_plans (client_id) where active;
