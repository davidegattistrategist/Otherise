-- Pausa e fine percorso del cliente.
--
-- In pausa ('paused'): il cliente usa l'app come sempre, ma non è tra i
--   pagamenti da incassare (lo gestisce l'app, qui non cambia nulla).
-- Percorso terminato ('archived', "ex cliente"): il cliente può entrare solo
--   nella chat (e nel proprio account per privacy ed uscita): niente
--   programmi, misure, allenamenti, check-up, pagamenti.
--
-- is_client_self() ora vale solo per i clienti con il percorso in corso
-- (attivi o in pausa); is_client_self_any() vale anche per gli ex clienti e
-- si usa solo per la chat e i consensi.

create or replace function public.is_client_self_any(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients c where c.id = cid and c.user_id = auth.uid())
$$;

create or replace function public.is_client_self(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients c where c.id = cid and c.user_id = auth.uid() and c.status <> 'archived')
$$;

grant execute on function public.is_client_self_any(uuid) to authenticated;

-- Chat: anche gli ex clienti
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self_any(client_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and deleted_at is null
              and (public.can_manage_client(client_id) or public.is_client_self_any(client_id)));
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (public.can_manage_client(client_id) or public.is_client_self_any(client_id)));
drop policy if exists message_transcripts_read on public.message_transcripts;
create policy message_transcripts_read on public.message_transcripts for select to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self_any(client_id));

-- Check e sessioni PT visibili al cliente: solo con il percorso in corso
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
  where client_id = public.my_client_id() and public.is_client_self(client_id)
    and visible_to_client and check_date is not null
  order by check_date
$$;

create or replace function public.my_pt_session_dates()
returns setof date language sql stable security definer set search_path = public as $$
  select session_date from public.pt_sessions
  where client_id = public.my_client_id() and public.is_client_self(client_id)
  order by session_date desc
$$;

-- Stato dei pagamenti: l'ex cliente non ha più nulla da pagare (e non riceve errori)
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
  if not (public.is_owner() or public.is_client_self_any(cid) or auth.uid() is null) then
    raise exception 'Non autorizzato';
  end if;
  return query
  select p.id, p.kind, p.amount,
         (select max(pay.period_end) from public.payments pay where pay.client_id = cid and pay.plan_id = p.id),
         coalesce((select sum(pay.sessions) from public.payments pay where pay.client_id = cid and pay.plan_id = p.id), 0)::int,
         ((select count(*) from public.pt_sessions s
           where s.client_id = cid and s.counts_toward_package and s.session_date >= p.start_date) + p.sessions_written_off)::int
  from public.payment_plans p
  join public.clients c on c.id = p.client_id
  where p.client_id = cid and p.active and not c.free
    and (c.status <> 'archived' or public.is_owner() or auth.uid() is null)
  order by p.created_at desc
  limit 1;
end $$;

-- Consensi: anche l'ex cliente può accettare o revocare (serve per la chat)
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
    if new.free is distinct from old.free then
      raise exception 'Solo il titolare può mettere un cliente gratis';
    end if;
    return new;
  end if;
  -- Ruolo service (server) o trigger interni: nessun limite
  if auth.uid() is null then
    return new;
  end if;
  -- Il cliente (tramite le funzioni qui sotto) cambia solo i propri consensi
  if public.is_client_self_any(old.id)
     and (to_jsonb(new) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out'])
       = (to_jsonb(old) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out']) then
    return new;
  end if;
  raise exception 'Non autorizzato';
end $$;
