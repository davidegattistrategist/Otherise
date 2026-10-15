-- Piano cambiato "dal prossimo rinnovo" (16/10): il piano nuovo parte il giorno
-- dopo l'ultimo periodo pagato del piano di prima. Finché non ha pagamenti suoi
-- vale come saldato fino al giorno prima del suo inizio (se il cliente aveva già
-- pagato periodi con un piano precedente), così lo stato resta "In regola" fino
-- al rinnovo invece di "Primo pagamento da registrare".
-- Da eseguire una volta nel SQL Editor di Supabase.

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
         coalesce((select max(pay.period_end) from public.payments pay where pay.client_id = cid and pay.plan_id = p.id),
                  case when exists (select 1 from public.payments op join public.payment_plans o on o.id = op.plan_id
                                    where o.client_id = p.client_id and o.id <> p.id and o.created_at < p.created_at and op.period_end is not null)
                       then p.start_date - 1 end),
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
         coalesce((select max(pay.period_end) from public.payments pay where pay.plan_id = p.id),
                  case when exists (select 1 from public.payments op join public.payment_plans o on o.id = op.plan_id
                                    where o.client_id = p.client_id and o.id <> p.id and o.created_at < p.created_at and op.period_end is not null)
                       then p.start_date - 1 end),
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

