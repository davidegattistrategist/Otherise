-- =====================================================================
-- Periodi di coaching rimasti da pagare (es. ha pagato le 6 settimane in
-- corso ma non quelle prima): restano nel registro come righe "da saldare"
-- (importo 0, unpaid = true) finché non le segni pagate. Non contano negli
-- incassi né nell'export; servono a non perdere il periodo scoperto.
-- =====================================================================
alter table public.payments add column if not exists unpaid boolean not null default false;

-- =====================================================================
-- Credito sulle lezioni PT, separato da quello del coaching: se paga un
-- pacchetto di lezioni più del dovuto, la differenza resta per le prossime
-- lezioni. credito lezioni = clients.pt_credit_adjust (correzione a mano)
-- + somma di payments.credit_change dei pagamenti di lezioni (con sessioni).
-- =====================================================================
alter table public.clients add column if not exists pt_credit_adjust numeric(10,2) not null default 0;

-- la correzione la fa solo il titolare
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
       or new.pt_baseline_left is distinct from old.pt_baseline_left
       or new.credit_adjust is distinct from old.credit_adjust
       or new.pt_credit_adjust is distinct from old.pt_credit_adjust then
      raise exception 'Solo il titolare gestisce pagamenti e sessioni PT';
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
