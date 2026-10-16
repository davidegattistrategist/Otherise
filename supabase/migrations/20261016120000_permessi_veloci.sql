-- Permessi (RLS) veloci — V2 del controllo generale (16/10/2026).
--
-- Prima ogni policy chiamava per OGNI RIGA letta le funzioni helper
-- (can_manage_client(client_id), is_client_self(client_id), auth.uid()…):
-- con 25.000 messaggi, my_unread_chats() (chiamata a ogni pagina e ogni 20 s
-- da ogni dispositivo) impiegava 2–3,5 secondi. Qui le stesse regole sono
-- riscritte nel modo consigliato da Supabase, SENZA cambiare chi vede cosa:
--
--  • auth.uid() e le funzioni senza argomenti (is_owner, is_staff, my_role,
--    my_client_id) stanno dentro (select …): Postgres le calcola una volta
--    per query (InitPlan) invece che per riga.
--  • can_manage_client(client_id)  →  (select is_owner()) or client_id in (select my_coached_clients())
--    (my_coached_clients(): i clienti del collaboratore, calcolati una volta e
--    tenuti in una tabella hash; per il titolare è sempre vero).
--  • is_client_self(client_id)     →  client_id = (select my_active_client_id())
--    (clients.user_id è unico: un utente ha al più una scheda cliente).
--  • is_client_self_any(client_id) →  client_id = (select my_client_id())
--
-- Le funzioni helper restano uguali (le usano trigger, funzioni RPC e il
-- codice): cambiano solo le policy. can_log_program(cid, pid) resta nei
-- WITH CHECK di logbook ed esercizi: lì si valuta solo sulle righe scritte
-- (una manciata), non su quelle lette.
--
-- Da eseguire una volta nel SQL Editor di Supabase.

-- =====================================================================
-- Nuove funzioni helper, senza argomenti: si valutano una volta per query
-- =====================================================================

-- La scheda cliente dell'utente con il percorso in corso (null se è un ex cliente o non è un cliente)
create or replace function public.my_active_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.clients c
  where c.user_id = (select auth.uid()) and c.status <> 'archived'
$$;

-- I clienti seguiti dal collaboratore che chiede (nessuno per titolare e clienti:
-- il titolare passa già da is_owner())
create or replace function public.my_coached_clients()
returns setof uuid language sql stable security definer set search_path = public rows 50 as $$
  select c.id from public.clients c
  where (select public.my_role()) = 'coach' and c.coach_id = (select auth.uid())
$$;

revoke execute on function public.my_active_client_id(), public.my_coached_clients() from anon, public;
grant execute on function public.my_active_client_id(), public.my_coached_clients() to authenticated, service_role;

-- =====================================================================
-- Policy riscritte (stesse regole di prima)
-- =====================================================================

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_owner())
         or ((select public.is_staff()) and role in ('owner', 'coach')));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = (select public.my_role()));
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles for update to authenticated
  using ((select public.is_owner()) and id <> (select auth.uid()))
  with check ((select public.is_owner()) and role in ('coach', 'none'));

-- staff_invites
drop policy if exists staff_invites_owner on public.staff_invites;
create policy staff_invites_owner on public.staff_invites for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- app_settings
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated
  using ((select public.is_staff()));
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ai_requests
drop policy if exists ai_requests_select on public.ai_requests;
create policy ai_requests_select on public.ai_requests for select to authenticated
  using ((select public.is_staff()));

-- backup_runs (come prima: senza "to", quindi per tutti i ruoli)
drop policy if exists backup_runs_owner_read on public.backup_runs;
create policy backup_runs_owner_read on public.backup_runs for select
  using ((select public.is_owner()));

-- exercises
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using ((select public.my_role()) <> 'none');
drop policy if exists exercises_staff_insert on public.exercises;
create policy exercises_staff_insert on public.exercises for insert to authenticated
  with check ((select public.is_staff()));
drop policy if exists exercises_staff_update on public.exercises;
create policy exercises_staff_update on public.exercises for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
drop policy if exists exercises_owner_delete on public.exercises;
create policy exercises_owner_delete on public.exercises for delete to authenticated
  using ((select public.is_owner()));

-- clients (can_manage_client(id) sulla riga stessa = titolare, oppure collaboratore con coach_id = lui)
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using ((select public.is_owner())
         or ((select public.my_role()) = 'coach' and coach_id = (select auth.uid()))
         or user_id = (select auth.uid()));
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check ((select public.is_owner())
              or ((select public.my_role()) = 'coach' and coach_id = (select auth.uid())));
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using ((select public.is_owner())
         or ((select public.my_role()) = 'coach' and coach_id = (select auth.uid())))
  with check ((select public.is_owner()) or coach_id = (select auth.uid()));
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated
  using ((select public.is_owner()));

-- programs
drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs for select to authenticated
  using ((is_template and (select public.is_staff()))
         or (client_id is not null and ((select public.is_owner()) or client_id in (select public.my_coached_clients())))
         or (client_id is not null and status <> 'draft' and client_id = (select public.my_active_client_id())));
drop policy if exists programs_insert on public.programs;
create policy programs_insert on public.programs for insert to authenticated
  with check ((is_template and (select public.is_staff()))
              or (client_id is not null and ((select public.is_owner()) or client_id in (select public.my_coached_clients()))));
drop policy if exists programs_update on public.programs;
create policy programs_update on public.programs for update to authenticated
  using ((is_template and (select public.is_staff()))
         or (client_id is not null and ((select public.is_owner()) or client_id in (select public.my_coached_clients()))))
  with check ((is_template and (select public.is_staff()))
              or (client_id is not null and ((select public.is_owner()) or client_id in (select public.my_coached_clients()))));
drop policy if exists programs_delete on public.programs;
create policy programs_delete on public.programs for delete to authenticated
  using ((is_template and (select public.is_staff()))
         or (client_id is not null and ((select public.is_owner()) or client_id in (select public.my_coached_clients()))));

-- workout_logs (WITH CHECK con can_log_program: solo sulle righe scritte)
drop policy if exists workout_logs_select on public.workout_logs;
create policy workout_logs_select on public.workout_logs for select to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()));
drop policy if exists workout_logs_insert on public.workout_logs;
create policy workout_logs_insert on public.workout_logs for insert to authenticated
  with check (public.can_log_program(client_id, program_id));
drop policy if exists workout_logs_update on public.workout_logs;
create policy workout_logs_update on public.workout_logs for update to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()))
  with check (public.can_log_program(client_id, program_id));
drop policy if exists workout_logs_delete on public.workout_logs;
create policy workout_logs_delete on public.workout_logs for delete to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()));

-- exercise_logs
drop policy if exists exercise_logs_select on public.exercise_logs;
create policy exercise_logs_select on public.exercise_logs for select to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()));
drop policy if exists exercise_logs_insert on public.exercise_logs;
create policy exercise_logs_insert on public.exercise_logs for insert to authenticated
  with check (
    public.can_log_program(client_id, program_id)
    and exists (select 1 from public.workout_logs w
                where w.id = workout_log_id and w.client_id = exercise_logs.client_id
                  and w.program_id = exercise_logs.program_id)
  );
drop policy if exists exercise_logs_update on public.exercise_logs;
create policy exercise_logs_update on public.exercise_logs for update to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()))
  with check (public.can_log_program(client_id, program_id));
drop policy if exists exercise_logs_delete on public.exercise_logs;
create policy exercise_logs_delete on public.exercise_logs for delete to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()));

-- checks (solo staff: il cliente passa da my_checks())
drop policy if exists checks_staff on public.checks;
create policy checks_staff on public.checks for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- check_photos
drop policy if exists check_photos_staff on public.check_photos;
create policy check_photos_staff on public.check_photos for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check (
    ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
    and exists (select 1 from public.checks c where c.id = check_id and c.client_id = check_photos.client_id)
    and path like client_id::text || '/' || check_id::text || '/%'
    and thumb_path like client_id::text || '/' || check_id::text || '/%'
  );

-- posture_assessments
drop policy if exists posture_staff on public.posture_assessments;
create policy posture_staff on public.posture_assessments for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));
drop policy if exists posture_client_select on public.posture_assessments;
create policy posture_client_select on public.posture_assessments for select to authenticated
  using (visible_to_client and client_id = (select public.my_active_client_id()));

-- pt_sessions
drop policy if exists pt_sessions_staff on public.pt_sessions;
create policy pt_sessions_staff on public.pt_sessions for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- client_private_notes
drop policy if exists private_notes_staff on public.client_private_notes;
create policy private_notes_staff on public.client_private_notes for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- client_ai_profiles
drop policy if exists client_ai_profiles_staff on public.client_ai_profiles;
create policy client_ai_profiles_staff on public.client_ai_profiles for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- client_projects
drop policy if exists client_projects_staff on public.client_projects;
create policy client_projects_staff on public.client_projects for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));
drop policy if exists client_projects_client on public.client_projects;
create policy client_projects_client on public.client_projects for select to authenticated
  using (client_id = (select public.my_active_client_id()) and visible);

-- chat_snoozes
drop policy if exists chat_snoozes_staff on public.chat_snoozes;
create policy chat_snoozes_staff on public.chat_snoozes for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- ai_reply_drafts
drop policy if exists ai_reply_drafts_staff on public.ai_reply_drafts;
create policy ai_reply_drafts_staff on public.ai_reply_drafts for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- program_ai_drafts
drop policy if exists program_ai_drafts_staff on public.program_ai_drafts;
create policy program_ai_drafts_staff on public.program_ai_drafts for all to authenticated
  using ((select public.is_staff())
         and (client_id is null or (select public.is_owner()) or client_id in (select public.my_coached_clients())))
  with check ((select public.is_staff())
              and (client_id is null or (select public.is_owner()) or client_id in (select public.my_coached_clients())));

-- free_workouts
drop policy if exists free_workouts_staff on public.free_workouts;
create policy free_workouts_staff on public.free_workouts for all to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));
drop policy if exists free_workouts_client on public.free_workouts;
create policy free_workouts_client on public.free_workouts for all to authenticated
  using (client_id = (select public.my_active_client_id()))
  with check (client_id = (select public.my_active_client_id())
              and performed_on >= current_date - 60 and performed_on <= current_date + 1);

-- checkins (diario)
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins for select to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_active_client_id()));
drop policy if exists checkins_client_insert on public.checkins;
create policy checkins_client_insert on public.checkins for insert to authenticated
  with check (client_id = (select public.my_active_client_id()));
drop policy if exists checkins_client_update on public.checkins;
create policy checkins_client_update on public.checkins for update to authenticated
  using (client_id = (select public.my_active_client_id()) and week_start >= current_date - 7)
  with check (client_id = (select public.my_active_client_id()));
drop policy if exists checkins_staff_update on public.checkins;
create policy checkins_staff_update on public.checkins for update to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients()))
  with check ((select public.is_owner()) or client_id in (select public.my_coached_clients()));

-- payment_plans e payments
drop policy if exists payment_plans_owner on public.payment_plans;
create policy payment_plans_owner on public.payment_plans for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists payment_plans_client_select on public.payment_plans;
create policy payment_plans_client_select on public.payment_plans for select to authenticated
  using (client_id = (select public.my_active_client_id()));
drop policy if exists payments_owner on public.payments;
create policy payments_owner on public.payments for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists payments_client_select on public.payments;
create policy payments_client_select on public.payments for select to authenticated
  using (client_id = (select public.my_active_client_id()));

-- notifications
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- push_subscriptions
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- drafts
drop policy if exists drafts_own on public.drafts;
create policy drafts_own on public.drafts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- messages (la chat resta anche agli ex clienti: my_client_id(), non quello attivo)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_client_id()));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and deleted_at is null
              and ((select public.is_owner()) or client_id in (select public.my_coached_clients())
                   or client_id = (select public.my_client_id())));
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

-- message_transcripts
drop policy if exists message_transcripts_read on public.message_transcripts;
create policy message_transcripts_read on public.message_transcripts for select to authenticated
  using ((select public.is_owner()) or client_id in (select public.my_coached_clients())
         or client_id = (select public.my_client_id()));

-- chat_reads
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and ((select public.is_owner()) or client_id in (select public.my_coached_clients())
                   or client_id = (select public.my_client_id())));

-- =====================================================================
-- Indici sulle colonne usate dalle policy che ancora ne erano senza
-- =====================================================================
create index if not exists program_ai_drafts_client_idx on public.program_ai_drafts (client_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
