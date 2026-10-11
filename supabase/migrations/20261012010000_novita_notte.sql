-- Novità della notte del 12 ottobre 2026.

-- Check importati dallo storico (fogli Google, Notion): servono come storico ma
-- non dicono che con quel cliente i check si fanno nell'app ("Check da fare"
-- compare solo per chi ha almeno un check registrato nell'app).
alter table public.checks add column if not exists imported boolean not null default false;
update public.checks set imported = true where sequence is not null or order_hint is not null;

-- Privacy: un solo consenso all'accesso (informativa, dati sulla salute, foto
-- e video per il servizio) e, a parte e facoltativo, il permesso di pubblicare
-- su Instagram alcuni video delle sedute per promuovere l'attività.
alter table public.clients add column if not exists instagram_consent_at timestamptz;
alter table public.app_settings add column if not exists privacy_pec text not null default '';

drop function if exists public.accept_privacy(text);
create or replace function public.accept_privacy(version text, instagram boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_client_id() is null then
    raise exception 'Non autorizzato';
  end if;
  update public.clients
     set privacy_accepted_at = now(), privacy_version = version,
         health_consent_at = now(), consent_source = 'app',
         instagram_consent_at = case when instagram then coalesce(instagram_consent_at, now()) else null end
   where id = public.my_client_id();
end $$;

create or replace function public.set_instagram_consent(consent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_client_id() is null then
    raise exception 'Non autorizzato';
  end if;
  update public.clients
     set instagram_consent_at = case when consent then coalesce(instagram_consent_at, now()) else null end
   where id = public.my_client_id();
end $$;

revoke execute on function public.accept_privacy(text, boolean), public.set_instagram_consent(boolean) from public, anon;
grant execute on function public.accept_privacy(text, boolean), public.set_instagram_consent(boolean) to authenticated, service_role;

-- il cliente cambia da solo anche il permesso per Instagram
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
     and (to_jsonb(new) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out', 'instagram_consent_at'])
       = (to_jsonb(old) - array['privacy_accepted_at', 'privacy_version', 'health_consent_at', 'consent_source', 'ai_opt_out', 'instagram_consent_at']) then
    return new;
  end if;
  raise exception 'Non autorizzato';
end $$;
