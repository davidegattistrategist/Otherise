-- =====================================================================
-- Il "check-up" settimanale ora si chiama "diario" (per non confonderlo con
-- il check in palestra). Cambiano solo i testi: tabelle e dati restano.
-- =====================================================================
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
            'Diario da guardare: ' || trim(c.first_name || ' ' || c.last_name),
            array_to_string(new.flag_reasons, ', '),
            '/staff/clienti/' || c.id || '/diario',
            'checkin:' || new.id || ':' || array_to_string(new.flag_reasons, ','))
    on conflict do nothing;
  end loop;
  return new;
end $$;

-- Le notifiche già arrivate prendono il nome nuovo
update public.notifications set
  title = replace(replace(replace(replace(title,
            'Check-up da guardare', 'Diario da guardare'),
            'ha risposto al tuo check-up', 'ha risposto al tuo diario'),
            'Il check-up della settimana è aperto', 'Il diario della settimana è aperto'),
            'Ultimo giorno per il check-up', 'Ultimo giorno per il diario'),
  body = replace(replace(body, 'check-up', 'diario'), 'Check-up', 'Diario'),
  link = replace(link, '/checkup', '/diario')
where title ilike '%check-up%' or body ilike '%check-up%' or link like '%/checkup%';

-- =====================================================================
-- Coaching o lezioni PT: il tipo di piano attivo di ogni cliente che si
-- segue (senza importi). Serve a non chiedere un programma a chi fa solo
-- lezioni PT. La può chiamare anche il collaboratore, per i suoi clienti.
-- =====================================================================
create or replace function public.client_plan_kinds()
returns table (client_id uuid, kind text)
language sql stable security definer set search_path = public as $$
  select p.client_id, p.kind
  from public.payment_plans p
  where p.active and public.can_manage_client(p.client_id)
$$;
revoke execute on function public.client_plan_kinds() from anon, public;
grant execute on function public.client_plan_kinds() to authenticated, service_role;
