-- =====================================================================
-- Sessioni PT: un solo contatore per cliente.
--   rimaste = sessioni pagate − sessioni fatte
-- Valgono tutte le sessioni pagate (pacchetti, lezioni a parte, saldi) e tutte
-- le sessioni PT segnate "conta nel pacchetto". Le sessioni fatte senza
-- copertura si scalano da sole dal pacchetto successivo; quelle pagate in più
-- restano da fare.
-- Da quando si conta: dalla correzione a mano ("oggi gliene restano N", campi
-- pt_baseline_*), altrimenti dal primo pacchetto o primo pagamento di sessioni
-- o, per chi non ha mai avuto un piano a periodo, dalla prima sessione PT. Chi ha un piano a
-- periodo (mensile, trimestrale…) e nessuna sessione pagata a parte non ha
-- contatore: le sessioni sono comprese nel piano.
-- =====================================================================

alter table public.clients
  add column if not exists pt_baseline_at timestamptz,
  add column if not exists pt_baseline_left int;

-- Il calcolo per un cliente (interno: lo usano le funzioni qui sotto, che controllano i permessi)
create or replace function public.pt_counter_for(cid uuid)
returns table (since date, baseline_at timestamptz, bought int, used int)
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_since date;
begin
  select id, free, pt_baseline_at, pt_baseline_left, pt_count_from, extra_sessions_adjust
    into c from public.clients where id = cid;
  if not found or c.free then
    return;
  end if;
  if c.pt_baseline_at is not null then
    return query select
      (c.pt_baseline_at at time zone 'Europe/Rome')::date,
      c.pt_baseline_at,
      (coalesce(c.pt_baseline_left, 0)
        + coalesce((select sum(p.sessions) from public.payments p
                    where p.client_id = cid and p.sessions > 0 and p.created_at > c.pt_baseline_at), 0))::int,
      ((select count(*) from public.pt_sessions s
        where s.client_id = cid and s.counts_toward_package and s.created_at > c.pt_baseline_at)
        + coalesce((select sum(pl.sessions_written_off) from public.payment_plans pl
                    where pl.client_id = cid and pl.package_closed_on >= (c.pt_baseline_at at time zone 'Europe/Rome')::date), 0))::int;
    return;
  end if;
  -- chi non ha mai avuto un piano a periodo: contano anche le sessioni fatte prima di pagare (scoperte)
  v_since := coalesce(c.pt_count_from,
    least((select min(pl.start_date) from public.payment_plans pl where pl.client_id = cid and pl.kind = 'package'),
          (select min(p.paid_on) from public.payments p where p.client_id = cid and p.sessions > 0),
          case when not exists (select 1 from public.payment_plans pl
                                where pl.client_id = cid and pl.kind not in ('package', 'single'))
               then (select min(s.session_date) from public.pt_sessions s where s.client_id = cid and s.counts_toward_package) end));
  if v_since is null then
    return;
  end if;
  return query select
    v_since,
    null::timestamptz,
    coalesce((select sum(p.sessions) from public.payments p where p.client_id = cid and p.sessions > 0), 0)::int,
    ((select count(*) from public.pt_sessions s
      where s.client_id = cid and s.counts_toward_package and s.session_date >= v_since)
      + coalesce((select sum(pl.sessions_written_off) from public.payment_plans pl where pl.client_id = cid), 0)
      + coalesce(c.extra_sessions_adjust, 0))::int;
end $$;

-- Tutti i contatori (solo titolare: sono dati di pagamento)
create or replace function public.pt_counters()
returns table (client_id uuid, since date, baseline_at timestamptz, bought int, used int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_owner() or auth.uid() is null) then
    raise exception 'Non autorizzato';
  end if;
  return query
  select c.id, k.since, k.baseline_at, k.bought, k.used
  from public.clients c
  cross join lateral public.pt_counter_for(c.id) k
  where c.status <> 'archived';
end $$;

-- Stato dei pagamenti del cliente: per i pacchetti le sessioni vengono dal contatore unico
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
         case when p.kind = 'package' then coalesce(k.bought, 0)
              else coalesce((select sum(pay.sessions) from public.payments pay where pay.client_id = cid and pay.plan_id = p.id), 0)::int end,
         case when p.kind = 'package' then coalesce(k.used, 0)
              else ((select count(*) from public.pt_sessions s
                     where s.client_id = cid and s.counts_toward_package and s.session_date >= p.start_date) + p.sessions_written_off)::int end
  from public.payment_plans p
  join public.clients c on c.id = p.client_id
  left join lateral public.pt_counter_for(cid) k on p.kind = 'package'
  where p.client_id = cid and p.active and not c.free
    and (c.status <> 'archived' or public.is_owner() or auth.uid() is null)
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
         case when p.kind = 'package' then coalesce(k.bought, 0)
              else coalesce((select sum(pay.sessions) from public.payments pay where pay.plan_id = p.id), 0)::int end,
         case when p.kind = 'package' then coalesce(k.used, 0)
              else ((select count(*) from public.pt_sessions s
                     where s.client_id = p.client_id and s.counts_toward_package and s.session_date >= p.start_date) + p.sessions_written_off)::int end
  from public.payment_plans p
  join public.clients c on c.id = p.client_id
  left join lateral public.pt_counter_for(p.client_id) k on p.kind = 'package'
  where p.active and c.status <> 'archived' and not c.free
  order by p.client_id, p.created_at desc;
end $$;

-- La correzione del contatore la fa solo il titolare
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
    if new.extra_sessions_adjust is distinct from old.extra_sessions_adjust
       or new.pt_count_from is distinct from old.pt_count_from
       or new.pt_session_price is distinct from old.pt_session_price
       or new.pt_baseline_at is distinct from old.pt_baseline_at
       or new.pt_baseline_left is distinct from old.pt_baseline_left then
      raise exception 'Solo il titolare gestisce il conteggio delle sessioni PT';
    end if;
    return new;
  end if;
  -- Ruolo service (server) o trigger interni: nessun limite
  if auth.uid() is null then
    return new;
  end if;
  -- Il cliente (tramite le funzioni dedicate) cambia solo i propri consensi
  if public.is_client_self_any(old.id)
     and (to_jsonb(new) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out', 'instagram_consent_at'])
       = (to_jsonb(old) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out', 'instagram_consent_at']) then
    return new;
  end if;
  raise exception 'Non autorizzato';
end $$;

revoke execute on function public.pt_counter_for(uuid) from anon, public, authenticated;
grant execute on function public.pt_counter_for(uuid) to service_role;
revoke execute on function public.pt_counters() from anon, public;
grant execute on function public.pt_counters() to authenticated, service_role;
revoke execute on function public.client_billing(uuid) from anon, public;
grant execute on function public.client_billing(uuid) to authenticated, service_role;
revoke execute on function public.billing_overview() from anon, public;
grant execute on function public.billing_overview() to authenticated, service_role;

-- Permesso per Instagram: un avviso (una volta sola) per i clienti che hanno
-- già accettato l'informativa senza darlo, a titolare e collaboratore che li segue
insert into public.notifications (recipient_id, client_id, kind, title, body, link, dedupe_key)
select r.id, c.id, 'instagram_consent',
       trim(c.first_name || ' ' || c.last_name) || ' non ha dato il permesso per Instagram',
       'Non possiamo pubblicare video o foto delle sedute con lui nelle storie. Se pensi che gli faccia piacere, parlagliene: può dare il permesso quando vuole dall''app, in Percorso → Privacy → Video sui social.',
       '/staff/clienti/' || c.id || '/profilo',
       'instagram:none:' || c.id
from public.clients c
join public.profiles r on r.role = 'owner' or r.id = c.coach_id
where c.status = 'active' and c.privacy_accepted_at is not null and c.instagram_consent_at is null
on conflict (recipient_id, dedupe_key) do nothing;
