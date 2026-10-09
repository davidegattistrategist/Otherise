-- =====================================================================
-- Otherise: schema del database
-- =====================================================================
-- Questo file crea tutte le tabelle, i permessi (Row Level Security) e
-- le funzioni dell'app. Si esegue una sola volta su un progetto Supabase
-- nuovo (SQL Editor > incolla > Run). Le modifiche future vanno in nuovi
-- file nella cartella supabase/migrations, mai modificando questo.
--
-- Ruoli:
--   owner  = il titolare (Diego). Vede e fa tutto.
--   coach  = collaboratore. Vede solo i clienti assegnati a lui.
--   client = cliente. Vede solo i propri dati.
--   none   = utente senza accesso (registrato ma non invitato).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Profili (uno per ogni utente che può entrare nell'app)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'none' check (role in ('owner', 'coach', 'client', 'none')),
  created_at timestamptz not null default now()
);

-- Email dei collaboratori invitati dal titolare: quando un utente con
-- questa email entra per la prima volta diventa "coach".
create table public.staff_invites (
  email text primary key check (email = lower(email)),
  full_name text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clienti
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  coach_id uuid references public.profiles (id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text check (email is null or email = lower(email)),
  phone text,
  sex text not null check (sex in ('M', 'F')),
  birth_date date,
  goals text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  start_date date not null default current_date,
  weekly_checkin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index clients_email_unique on public.clients (email) where email is not null;
create index clients_coach_idx on public.clients (coach_id);

-- Note riservate dello staff sul cliente (il cliente non le vede)
create table public.client_private_notes (
  client_id uuid primary key references public.clients (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funzioni di permesso (usate dalle regole RLS)
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'none')
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner'
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('owner', 'coach')
$$;

-- Lo staff può gestire questo cliente? (titolare sempre, collaboratore solo se assegnato)
create or replace function public.can_manage_client(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner()
      or (public.my_role() = 'coach'
          and exists (select 1 from public.clients c where c.id = cid and c.coach_id = auth.uid()))
$$;

-- L'utente collegato è proprio questo cliente?
create or replace function public.is_client_self(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients c where c.id = cid and c.user_id = auth.uid())
$$;

-- Id del cliente collegato (null se non è un cliente)
create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clients where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Eserciziario
-- ---------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  video_url text,
  description text not null default '',
  category text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exercises_name_unique on public.exercises (lower(name));

-- ---------------------------------------------------------------------
-- Programmi
-- ---------------------------------------------------------------------
-- Il contenuto del programma (giorni, blocchi, esercizi, prescrizioni per
-- settimana) è un documento JSON nella colonna "content". La struttura è
-- descritta in src/lib/program/types.ts.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  is_template boolean not null default false,
  title text not null,
  description text not null default '',
  start_date date,
  weeks int not null default 4 check (weeks between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  content jsonb not null default '{"days": []}'::jsonb,
  previous_program_id uuid references public.programs (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'template', 'ai', 'import', 'copy')),
  ai_notes jsonb,
  is_ai_example boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint programs_template_or_client check (is_template = (client_id is null)),
  constraint programs_template_never_published check (not is_template or status = 'draft'),
  constraint programs_published_has_start check (status = 'draft' or start_date is not null)
);
create index programs_client_idx on public.programs (client_id, start_date desc);

-- ---------------------------------------------------------------------
-- Logbook del cliente
-- ---------------------------------------------------------------------
-- Una riga per ogni sessione registrata (giorno X della settimana Y)
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  day_id text not null,
  week int not null check (week >= 1),
  performed_on date not null default current_date,
  completed boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, week, day_id)
);
create index workout_logs_client_idx on public.workout_logs (client_id, performed_on desc);

-- Una riga per esercizio registrato dentro una sessione
create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  item_id text not null,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,
  week int not null,
  performed_on date not null,
  sets jsonb not null default '[]'::jsonb,
  result_text text not null default '',
  created_at timestamptz not null default now(),
  unique (workout_log_id, item_id)
);
create index exercise_logs_lookup_idx on public.exercise_logs (client_id, exercise_id, performed_on desc);
create index exercise_logs_name_idx on public.exercise_logs (client_id, lower(exercise_name), performed_on desc);

-- ---------------------------------------------------------------------
-- Sessioni PT, check, posturale
-- ---------------------------------------------------------------------
create table public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  session_date date not null default current_date,
  notes text not null default '',
  counts_toward_package boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pt_sessions_client_idx on public.pt_sessions (client_id, session_date desc);

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  check_date date not null default current_date,
  weight_kg numeric(5, 1),
  age_years int,
  sex text check (sex in ('M', 'F')),
  skinfolds jsonb not null default '{}'::jsonb,
  skinfold_sum_mm numeric(6, 2),
  body_fat_pct numeric(5, 2),
  fat_mass_kg numeric(5, 2),
  lean_mass_kg numeric(5, 2),
  circumferences jsonb not null default '{}'::jsonb,
  strength_tests jsonb not null default '[]'::jsonb,
  tests_text text not null default '',
  notes_next_phase text not null default '',
  visible_to_client boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index checks_client_idx on public.checks (client_id, check_date desc);

create table public.posture_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  assessed_on date not null default current_date,
  tight_muscles text not null default '',
  what_works text not null default '',
  posture_work text not null default '',
  notes text not null default '',
  visible_to_client boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index posture_client_idx on public.posture_assessments (client_id, assessed_on desc);

-- ---------------------------------------------------------------------
-- Pagamenti (solo il titolare li vede e li modifica)
-- ---------------------------------------------------------------------
create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('monthly', 'six_weeks', 'quarterly', 'semiannual', 'annual', 'package', 'single')),
  amount numeric(8, 2) not null default 0,
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'paypal', 'card', 'other')),
  start_date date not null default current_date,
  package_sessions int check (package_sessions is null or package_sessions > 0),
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index payment_plans_client_idx on public.payment_plans (client_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  plan_id uuid references public.payment_plans (id) on delete set null,
  paid_on date not null default current_date,
  amount numeric(8, 2) not null,
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'paypal', 'card', 'other')),
  period_start date,
  period_end date,
  sessions int check (sessions is null or sessions > 0),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_period_order check (period_end is null or period_start is null or period_end >= period_start)
);
create index payments_client_idx on public.payments (client_id, paid_on desc);

-- ---------------------------------------------------------------------
-- Check-up settimanale
-- ---------------------------------------------------------------------
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  week_start date not null,
  training int not null check (training between 1 and 5),
  sleep int not null check (sleep between 1 and 5),
  stress int not null check (stress between 1 and 5),
  adherence int not null check (adherence between 1 and 5),
  issues text not null default '',
  request text not null default '',
  flagged boolean not null default false,
  flag_reasons text[] not null default '{}',
  coach_reply text not null default '',
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (client_id, week_start)
);

-- ---------------------------------------------------------------------
-- Notifiche in app (ed email)
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  dedupe_key text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create unique index notifications_dedupe on public.notifications (recipient_id, dedupe_key);

-- ---------------------------------------------------------------------
-- Impostazioni dell'attività (una sola riga)
-- ---------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Otherise',
  coaching_method text not null default '',
  reminder_days int not null default 7 check (reminder_days between 1 and 30),
  ai_monthly_budget_eur numeric(8, 2) not null default 20,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- Registro delle richieste all'assistente AI (per il tetto di spesa)
create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  kind text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_eur numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Regole di accesso (Row Level Security)
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.clients enable row level security;
alter table public.client_private_notes enable row level security;
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.pt_sessions enable row level security;
alter table public.checks enable row level security;
alter table public.posture_assessments enable row level security;
alter table public.payment_plans enable row level security;
alter table public.payments enable row level security;
alter table public.checkins enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.ai_requests enable row level security;

-- Profili: ognuno vede il proprio; lo staff vede quelli dello staff;
-- il titolare vede tutti e può cambiare nome e ruolo dei collaboratori.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_owner() or (public.is_staff() and role in ('owner', 'coach')));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());
create policy profiles_owner_update on public.profiles for update to authenticated
  using (public.is_owner() and id <> auth.uid()) with check (public.is_owner() and role in ('coach', 'none'));

create policy staff_invites_owner on public.staff_invites for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Clienti
create policy clients_select on public.clients for select to authenticated
  using (public.can_manage_client(id) or user_id = auth.uid());
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_owner() or (public.my_role() = 'coach' and coach_id = auth.uid()));
create policy clients_update on public.clients for update to authenticated
  using (public.can_manage_client(id))
  with check (public.is_owner() or coach_id = auth.uid());
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_owner());

create policy private_notes_staff on public.client_private_notes for all to authenticated
  using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

-- Eserciziario: tutti gli utenti dell'app lo leggono, lo staff lo modifica
create policy exercises_select on public.exercises for select to authenticated
  using (public.my_role() <> 'none');
create policy exercises_staff_insert on public.exercises for insert to authenticated
  with check (public.is_staff());
create policy exercises_staff_update on public.exercises for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy exercises_owner_delete on public.exercises for delete to authenticated
  using (public.is_owner());

-- Programmi: modelli visibili allo staff; programmi dei clienti allo staff
-- che gestisce il cliente; il cliente vede solo quelli pubblicati o archiviati.
create policy programs_select on public.programs for select to authenticated
  using (
    (is_template and public.is_staff())
    or (client_id is not null and public.can_manage_client(client_id))
    or (client_id is not null and status <> 'draft' and public.is_client_self(client_id))
  );
create policy programs_insert on public.programs for insert to authenticated
  with check ((is_template and public.is_staff()) or (client_id is not null and public.can_manage_client(client_id)));
create policy programs_update on public.programs for update to authenticated
  using ((is_template and public.is_staff()) or (client_id is not null and public.can_manage_client(client_id)))
  with check ((is_template and public.is_staff()) or (client_id is not null and public.can_manage_client(client_id)));
create policy programs_delete on public.programs for delete to authenticated
  using ((is_template and public.is_staff()) or (client_id is not null and public.can_manage_client(client_id)));

-- Logbook: il cliente registra le proprie sessioni (solo su programmi
-- pubblicati), lo staff del cliente legge e può correggere.
create or replace function public.can_log_program(cid uuid, pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.programs p
    where p.id = pid and p.client_id = cid and p.status in ('published', 'archived')
  ) and (public.is_client_self(cid) or public.can_manage_client(cid))
$$;

create policy workout_logs_select on public.workout_logs for select to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id));
create policy workout_logs_insert on public.workout_logs for insert to authenticated
  with check (public.can_log_program(client_id, program_id));
create policy workout_logs_update on public.workout_logs for update to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id))
  with check (public.can_log_program(client_id, program_id));
create policy workout_logs_delete on public.workout_logs for delete to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id));

create policy exercise_logs_select on public.exercise_logs for select to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id));
create policy exercise_logs_insert on public.exercise_logs for insert to authenticated
  with check (
    public.can_log_program(client_id, program_id)
    and exists (select 1 from public.workout_logs w
                where w.id = workout_log_id and w.client_id = exercise_logs.client_id
                  and w.program_id = exercise_logs.program_id)
  );
create policy exercise_logs_update on public.exercise_logs for update to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id))
  with check (public.can_log_program(client_id, program_id));
create policy exercise_logs_delete on public.exercise_logs for delete to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id));

-- Sessioni PT: note riservate dello staff
create policy pt_sessions_staff on public.pt_sessions for all to authenticated
  using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

-- Check: lo staff gestisce, il cliente vede quelli resi visibili
create policy checks_staff on public.checks for all to authenticated
  using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));
-- Il cliente NON legge la tabella checks direttamente (contiene le note
-- riservate per la prossima fase): usa la funzione my_checks() qui sotto.

-- Posturale: come i check, ma nascosto al cliente se non reso visibile
create policy posture_staff on public.posture_assessments for all to authenticated
  using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));
create policy posture_client_select on public.posture_assessments for select to authenticated
  using (visible_to_client and public.is_client_self(client_id));

-- Pagamenti: solo il titolare. Il cliente vede i propri (lo stato del percorso).
create policy payment_plans_owner on public.payment_plans for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy payment_plans_client_select on public.payment_plans for select to authenticated
  using (public.is_client_self(client_id));
create policy payments_owner on public.payments for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy payments_client_select on public.payments for select to authenticated
  using (public.is_client_self(client_id));

-- Check-up: il cliente compila il proprio (e lo corregge nella stessa
-- settimana), lo staff del cliente lo legge e risponde.
create policy checkins_select on public.checkins for select to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id));
create policy checkins_client_insert on public.checkins for insert to authenticated
  with check (public.is_client_self(client_id));
create policy checkins_client_update on public.checkins for update to authenticated
  using (public.is_client_self(client_id) and week_start >= current_date - 7)
  with check (public.is_client_self(client_id));
create policy checkins_staff_update on public.checkins for update to authenticated
  using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

-- Notifiche: ognuno vede e segna come lette le proprie
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Impostazioni: lo staff legge, il titolare modifica
create policy settings_select on public.app_settings for select to authenticated
  using (public.is_staff());
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy ai_requests_select on public.ai_requests for select to authenticated
  using (public.is_staff());

-- =====================================================================
-- Protezioni sui campi che il cliente non deve poter cambiare
-- =====================================================================
-- Un cliente può aggiornare solo il proprio telefono (gli altri campi li
-- gestisce lo staff). Un collaboratore non può riassegnare un cliente.
create or replace function public.guard_client_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_owner() then
    return new;
  end if;
  if public.my_role() = 'coach' then
    if new.coach_id is distinct from old.coach_id then
      raise exception 'Solo il titolare può riassegnare un cliente';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Non puoi cambiare l''account collegato';
    end if;
    return new;
  end if;
  -- Ruolo service (server) o trigger interni: nessun limite
  if auth.uid() is null then
    return new;
  end if;
  raise exception 'Non autorizzato';
end $$;
create trigger clients_guard before update on public.clients
  for each row execute function public.guard_client_update();

-- Il cliente non può modificare risposta e revisione del check-up;
-- lo staff non può modificare le risposte del cliente.
create or replace function public.guard_checkin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_client_self(old.client_id) and not public.is_staff() then
    new.coach_reply := old.coach_reply;
    new.reviewed_at := old.reviewed_at;
    new.client_id := old.client_id;
    new.week_start := old.week_start;
  elsif public.is_staff() then
    new.training := old.training;
    new.sleep := old.sleep;
    new.stress := old.stress;
    new.adherence := old.adherence;
    new.issues := old.issues;
    new.request := old.request;
    new.flagged := old.flagged;
    new.flag_reasons := old.flag_reasons;
    new.client_id := old.client_id;
    new.week_start := old.week_start;
  end if;
  return new;
end $$;
create trigger checkins_guard before update on public.checkins
  for each row execute function public.guard_checkin_update();

-- updated_at automatico
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger programs_touch before update on public.programs for each row execute function public.touch_updated_at();
create trigger exercises_touch before update on public.exercises for each row execute function public.touch_updated_at();
create trigger workout_logs_touch before update on public.workout_logs for each row execute function public.touch_updated_at();

-- =====================================================================
-- Nuovi utenti: il ruolo si decide dai dati del database, mai da ciò che
-- l'utente scrive in fase di registrazione.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(new.email);
  v_role text := 'none';
  v_name text := '';
  v_client public.clients%rowtype;
begin
  if not exists (select 1 from public.profiles where role = 'owner') then
    -- Il primissimo utente dell'installazione è il titolare
    v_role := 'owner';
  elsif exists (select 1 from public.staff_invites where email = v_email) then
    v_role := 'coach';
    select full_name into v_name from public.staff_invites where email = v_email;
    delete from public.staff_invites where email = v_email;
  else
    select * into v_client from public.clients where email = v_email and user_id is null limit 1;
    if found then
      v_role := 'client';
      v_name := trim(v_client.first_name || ' ' || v_client.last_name);
      update public.clients set user_id = new.id where id = v_client.id;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, v_email, coalesce(nullif(v_name, ''), split_part(v_email, '@', 1)), v_role)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Check-up: segnalazione automatica a chi segue il cliente
-- =====================================================================
create or replace function public.monday_of(d date)
returns date language sql immutable as $$
  select d - ((extract(isodow from d)::int) - 1)
$$;

create or replace function public.flag_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prev public.checkins%rowtype;
  reasons text[] := '{}';
begin
  select * into prev from public.checkins
    where client_id = new.client_id and week_start < new.week_start
    order by week_start desc limit 1;

  if new.training <= 2 then reasons := array_append(reasons, 'Allenamenti'); end if;
  if new.sleep <= 2 then reasons := array_append(reasons, 'Sonno'); end if;
  if new.stress <= 2 then reasons := array_append(reasons, 'Stress'); end if;
  if new.adherence <= 2 then reasons := array_append(reasons, 'Percorso'); end if;
  if prev.id is not null then
    if prev.training - new.training >= 2 and not ('Allenamenti' = any(reasons)) then reasons := array_append(reasons, 'Allenamenti in calo'); end if;
    if prev.sleep - new.sleep >= 2 and not ('Sonno' = any(reasons)) then reasons := array_append(reasons, 'Sonno in calo'); end if;
    if prev.stress - new.stress >= 2 and not ('Stress' = any(reasons)) then reasons := array_append(reasons, 'Stress in calo'); end if;
    if prev.adherence - new.adherence >= 2 and not ('Percorso' = any(reasons)) then reasons := array_append(reasons, 'Percorso in calo'); end if;
  end if;
  if length(trim(new.request)) > 0 then reasons := array_append(reasons, 'Richiesta'); end if;

  new.flagged := cardinality(reasons) > 0;
  new.flag_reasons := reasons;
  return new;
end $$;

create trigger checkins_flag before insert or update of training, sleep, stress, adherence, request
  on public.checkins for each row execute function public.flag_checkin();

-- Chi deve ricevere le notifiche su un cliente: titolare + collaboratore assegnato
create or replace function public.client_staff_recipients(cid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where role = 'owner'
  union
  select coach_id from public.clients where id = cid and coach_id is not null
$$;

create or replace function public.notify_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.clients%rowtype;
  r uuid;
begin
  if not new.flagged then return new; end if;
  if tg_op = 'UPDATE' and old.flagged and old.flag_reasons = new.flag_reasons then return new; end if;
  select * into c from public.clients where id = new.client_id;
  for r in select * from public.client_staff_recipients(new.client_id) loop
    insert into public.notifications (recipient_id, client_id, kind, title, body, link, dedupe_key)
    values (r, c.id, 'checkin_flag',
            'Check-up da guardare: ' || trim(c.first_name || ' ' || c.last_name),
            array_to_string(new.flag_reasons, ', '),
            '/staff/clienti/' || c.id || '/checkup',
            'checkin:' || new.id || ':' || array_to_string(new.flag_reasons, ','))
    on conflict do nothing;
  end loop;
  return new;
end $$;

create trigger checkins_notify after insert or update on public.checkins
  for each row execute function public.notify_checkin();

-- =====================================================================
-- Funzioni chiamate dall'app
-- =====================================================================

-- Stato del percorso di un cliente (scadenze e sessioni rimaste).
-- La può chiamare il titolare o il cliente stesso.
create or replace function public.client_billing(cid uuid)
returns table (
  plan_id uuid,
  kind text,
  amount numeric,
  paid_until date,
  sessions_bought int,
  sessions_used int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_owner() or public.is_client_self(cid) or auth.uid() is null) then
    raise exception 'Non autorizzato';
  end if;
  return query
  select p.id, p.kind, p.amount,
         (select max(pay.period_end) from public.payments pay where pay.client_id = cid and pay.plan_id = p.id),
         coalesce((select sum(pay.sessions) from public.payments pay where pay.client_id = cid and pay.plan_id = p.id), 0)::int,
         (select count(*) from public.pt_sessions s
           where s.client_id = cid and s.counts_toward_package and s.session_date >= p.start_date)::int
  from public.payment_plans p
  where p.client_id = cid and p.active
  order by p.created_at desc
  limit 1;
end $$;

-- Stato pagamenti di tutti i clienti (solo titolare), per la lista e gli avvisi
create or replace function public.billing_overview()
returns table (
  client_id uuid,
  plan_id uuid,
  kind text,
  amount numeric,
  start_date date,
  paid_until date,
  sessions_bought int,
  sessions_used int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_owner() or auth.uid() is null) then
    raise exception 'Non autorizzato';
  end if;
  return query
  select distinct on (p.client_id)
         p.client_id, p.id, p.kind, p.amount, p.start_date,
         (select max(pay.period_end) from public.payments pay where pay.plan_id = p.id),
         coalesce((select sum(pay.sessions) from public.payments pay where pay.plan_id = p.id), 0)::int,
         (select count(*) from public.pt_sessions s
           where s.client_id = p.client_id and s.counts_toward_package and s.session_date >= p.start_date)::int
  from public.payment_plans p
  join public.clients c on c.id = p.client_id
  where p.active and c.status <> 'archived'
  order by p.client_id, p.created_at desc;
end $$;

-- Check visibili al cliente, senza le note riservate dello staff
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
  where client_id = public.my_client_id() and visible_to_client
  order by check_date
$$;

-- Sessioni PT fatte dal cliente (al cliente servono solo i conteggi,
-- non le note dello staff)
create or replace function public.my_pt_session_dates()
returns setof date language sql stable security definer set search_path = public as $$
  select session_date from public.pt_sessions
  where client_id = public.my_client_id()
  order by session_date desc
$$;

-- Ultimo valore registrato da un cliente per un esercizio (per "la volta scorsa")
create or replace function public.last_exercise_logs(cid uuid, before_date date default current_date + 1)
returns table (
  exercise_id uuid,
  exercise_name text,
  performed_on date,
  week int,
  sets jsonb,
  result_text text
) language sql stable security definer set search_path = public as $$
  select distinct on (coalesce(l.exercise_id::text, lower(l.exercise_name)))
         l.exercise_id, l.exercise_name, l.performed_on, l.week, l.sets, l.result_text
  from public.exercise_logs l
  where l.client_id = cid
    and l.performed_on < before_date
    and (public.can_manage_client(cid) or public.is_client_self(cid))
    and (jsonb_array_length(l.sets) > 0 or length(l.result_text) > 0)
  order by coalesce(l.exercise_id::text, lower(l.exercise_name)), l.performed_on desc, l.created_at desc
$$;

-- Nomi dello staff (il cliente vede chi lo segue)
create or replace function public.my_coach_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.full_name from public.clients c join public.profiles p on p.id = c.coach_id where c.user_id = auth.uid()),
    (select full_name from public.profiles where role = 'owner' limit 1)
  )
$$;

-- Nome dell'attività (visibile anche ai clienti)
create or replace function public.business_name()
returns text language sql stable security definer set search_path = public as $$
  select business_name from public.app_settings where id = 1
$$;

-- Le funzioni interne non devono essere chiamate da chi non è collegato
revoke execute on all functions in schema public from anon, public;
grant execute on function public.my_role(), public.is_owner(), public.is_staff(),
  public.can_manage_client(uuid), public.is_client_self(uuid), public.my_client_id(),
  public.can_log_program(uuid, uuid), public.client_billing(uuid), public.billing_overview(), public.my_pt_session_dates(), public.my_checks(),
  public.last_exercise_logs(uuid, date), public.my_coach_name(), public.business_name(),
  public.monday_of(date)
  to authenticated, service_role;
revoke all on all tables in schema public from anon;
