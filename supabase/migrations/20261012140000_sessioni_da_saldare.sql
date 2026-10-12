-- Sessioni PT a parte (fuori dal piano): si possono contare anche prima di
-- essere pagate. pt_count_from = da quando si contano (se manca, dal primo
-- pagamento extra); pt_session_price = prezzo di una sessione per quel cliente,
-- serve a calcolare quanto c'è da saldare.
alter table public.clients add column if not exists pt_count_from date;
alter table public.clients add column if not exists pt_session_price numeric(8, 2) check (pt_session_price is null or pt_session_price >= 0);

-- Solo il titolare imposta conteggio e prezzo (il collaboratore non vede i pagamenti)
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
       or new.pt_session_price is distinct from old.pt_session_price then
      raise exception 'Solo il titolare gestisce le sessioni PT a parte';
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
