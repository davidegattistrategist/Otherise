-- Diario modificato dal cliente dopo che il trainer l'aveva già guardato:
-- prima restava "visto" e la modifica non compariva più in Oggi. Ora, se il
-- cliente cambia le risposte, la revisione si azzera e il diario (se segnalato)
-- torna tra quelli da guardare. Le regole di prima restano: il cliente non
-- tocca la risposta del trainer, lo staff non tocca le risposte del cliente.
create or replace function public.guard_checkin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_client_self(old.client_id) and not public.is_staff() then
    new.coach_reply := old.coach_reply;
    new.reviewed_at := old.reviewed_at;
    new.client_id := old.client_id;
    new.week_start := old.week_start;
    if new.training is distinct from old.training or new.sleep is distinct from old.sleep
       or new.stress is distinct from old.stress or new.adherence is distinct from old.adherence
       or new.issues is distinct from old.issues or new.request is distinct from old.request then
      new.reviewed_at := null;
    end if;
  elsif public.is_staff() then
    new.training := old.training;
    new.sleep := old.sleep;
    new.stress := old.stress;
    new.adherence := old.adherence;
    new.issues := old.issues;
    new.request := old.request;
    new.flagged := old.flagged;
    new.flag_reasons := old.flag_reasons;
    new.client_id := old.client_id;
    new.week_start := old.week_start;
  end if;
  return new;
end $$;
