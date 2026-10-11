-- Clienti gratis (es. un cliente di prova del trainer o lui stesso): non
-- compaiono in pagamenti, scadenze, incassi, previsioni ed export.
-- Lo decide solo il titolare.

alter table public.clients add column if not exists free boolean not null default false;

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
         ((select count(*) from public.pt_sessions s
           where s.client_id = cid and s.counts_toward_package and s.session_date >= p.start_date) + p.sessions_written_off)::int
  from public.payment_plans p
  join public.clients c on c.id = p.client_id
  where p.client_id = cid and p.active and not c.free
  order by p.created_at desc
  limit 1;
end $$;

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
         ((select count(*) from public.pt_sessions s
           where s.client_id = p.client_id and s.counts_toward_package and s.session_date >= p.start_date) + p.sessions_written_off)::int
  from public.payment_plans p
  join public.clients c on c.id = p.client_id
  where p.active and c.status <> 'archived' and not c.free
  order by p.client_id, p.created_at desc;
end $$;

-- il collaboratore non può mettere (o togliere) un cliente gratis
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
  if public.is_client_self(old.id)
     and (to_jsonb(new) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out'])
       = (to_jsonb(old) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out']) then
    return new;
  end if;
  raise exception 'Non autorizzato';
end $$;
