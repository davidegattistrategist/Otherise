-- =====================================================================
-- Robustezza e velocità (decisioni del 15/10, voci "Dopo").
-- 1) Indici per le letture più frequenti (Oggi, campanella, email, piani).
-- 2) Titolare preimpostato: se in app_secrets c'è "owner_email", diventa
--    titolare solo chi entra con quell'email (non più "il primo che arriva").
-- 3) Trascrizioni: un tetto al giorno per persona (dettatura e vocali).
-- 4) Bozze: solo testo o oggetti, al massimo 300 per persona.
-- =====================================================================

-- 1) Indici
create index if not exists checkins_flagged_idx on public.checkins (client_id) where flagged and reviewed_at is null;
create index if not exists workout_logs_discomfort_idx on public.workout_logs (updated_at desc) where discomfort <> '' and discomfort_seen_at is null;
create index if not exists workout_logs_note_flag_idx on public.workout_logs (updated_at desc) where note_flag and note_seen_at is null;
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index if not exists notifications_email_idx on public.notifications (created_at) where emailed_at is null;
create index if not exists payments_plan_idx on public.payments (plan_id);

-- 2) Titolare preimpostato
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(new.email);
  v_role text := 'none';
  v_name text := '';
  v_client public.clients%rowtype;
  v_owner_email text;
begin
  select lower(btrim(value)) into v_owner_email from public.app_secrets where name = 'owner_email';
  if not exists (select 1 from public.profiles where role = 'owner')
     and (coalesce(v_owner_email, '') = '' or v_owner_email = v_email) then
    -- Il titolare: l'email preimpostata, oppure (senza) il primissimo utente
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

-- 3) Trascrizioni: conteggio per persona e giorno, lo usa solo il server
create table if not exists public.transcription_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.transcription_usage enable row level security;
revoke all on public.transcription_usage from anon, authenticated;
grant all on public.transcription_usage to service_role;

-- aggiunge una trascrizione al conto di oggi; false = tetto raggiunto (non conta)
create or replace function public.use_transcription(uid uuid, max_per_day int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into public.transcription_usage (user_id, day, count) values (uid, current_date, 0)
  on conflict (user_id, day) do nothing;
  update public.transcription_usage set count = count + 1
  where user_id = uid and day = current_date and count < max_per_day
  returning count into v_count;
  return v_count is not null;
end $$;
revoke execute on function public.use_transcription(uuid, int) from anon, authenticated, public;
grant execute on function public.use_transcription(uuid, int) to service_role;

-- 4) Bozze: solo testo o oggetti (le righe vecchie restano come sono)
alter table public.drafts drop constraint if exists drafts_data_shape;
alter table public.drafts add constraint drafts_data_shape check (jsonb_typeof(data) in ('object', 'string')) not valid;

-- al massimo 300 bozze per persona: oltre, si tolgono le più vecchie
create or replace function public.trim_drafts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.drafts d
  where d.user_id = new.user_id
    and d.key in (
      select key from public.drafts where user_id = new.user_id
      order by updated_at desc offset 300
    );
  return null;
end $$;
drop trigger if exists drafts_trim on public.drafts;
create trigger drafts_trim after insert on public.drafts
  for each row execute function public.trim_drafts();

-- 5) Sessioni PT per il collaboratore: quante ne restano (o da saldare), senza importi
create or replace function public.pt_balance_for(cid uuid)
returns table (bought int, used int)
language sql stable security definer set search_path = public as $$
  select k.bought, k.used
  from public.pt_counter_for(cid) k
  where public.can_manage_client(cid)
$$;
revoke execute on function public.pt_balance_for(uuid) from anon, public;
grant execute on function public.pt_balance_for(uuid) to authenticated, service_role;
