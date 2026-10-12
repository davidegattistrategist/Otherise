-- Sessioni PT extra (fuori dal piano): correzione manuale del conteggio.
-- Le sessioni comprate sono la somma delle "sessioni" dei pagamenti extra
-- (senza piano); quelle fatte sono le sessioni PT che scalano dal pacchetto,
-- dal primo pagamento extra. Questo numero corregge il conteggio a mano.
alter table public.clients add column if not exists extra_sessions_adjust int not null default 0;

-- Solo il titolare corregge il conteggio (il collaboratore non vede i pagamenti)
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
    if new.extra_sessions_adjust is distinct from old.extra_sessions_adjust then
      raise exception 'Solo il titolare può correggere le sessioni extra';
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
