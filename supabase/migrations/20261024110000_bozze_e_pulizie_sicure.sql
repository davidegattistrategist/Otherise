-- Rete di sicurezza sui dati (24/10), dopo l'incidente del 23/10.
--
-- 1) Bozze: il tetto di 300 per persona non tocca più la modalità check né i
--    segni di cancellazione (altrimenti una bozza cancellata poteva tornare).
-- 2) Versioni dei programmi: il taglio a 30 risparmia sempre la più vecchia
--    (la versione pubblicata di partenza).
-- 3) Allegati della chat: un messaggio può indicare solo file della propria
--    chat (un messaggio scritto a mano con il percorso di un file altrui
--    poteva farlo cancellare o leggere).
-- 4) Pesate e allenamenti liberi: chi scrive è chi è collegato (created_by
--    non si può fingere).
-- 5) client_staff_recipients: solo il server (restituiva lo staff di qualsiasi cliente).

-- 1) bozze
create or replace function public.trim_drafts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.drafts d
  where d.user_id = new.user_id
    and d.key in (
      select key from public.drafts
      where user_id = new.user_id and key <> 'modalita-check' and not (data ? '__deleted')
      order by updated_at desc offset 300
    );
  return null;
end $$;

-- 2) versioni dei programmi: 29 più recenti + la prima
create or replace function public.program_revisions_trim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.program_revisions r
  where r.program_id = new.program_id
    and r.id not in (
      (select id from public.program_revisions where program_id = new.program_id order by created_at desc limit 29)
      union
      (select id from public.program_revisions where program_id = new.program_id order by created_at asc limit 1)
    );
  return null;
end $$;

-- 3) allegati della chat
create or replace function public.guard_message_attachments()
returns trigger language plpgsql as $$
declare
  a jsonb;
begin
  if new.attachments is null then
    new.attachments := '[]'::jsonb;
  end if;
  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'allegati non validi';
  end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(a->'path') <> 'string'
       or position(new.client_id::text || '/' in (a->>'path')) <> 1
       or position('..' in (a->>'path')) > 0 then
      raise exception 'allegato di un''altra chat';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists guard_message_attachments on public.messages;
create trigger guard_message_attachments before insert or update of attachments on public.messages
  for each row execute function public.guard_message_attachments();

-- 4) chi scrive è chi è collegato (dal server, con la service role, resta come passato)
create or replace function public.set_created_by()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists set_created_by on public.weight_logs;
create trigger set_created_by before insert on public.weight_logs for each row execute function public.set_created_by();
drop trigger if exists set_created_by on public.free_workouts;
create trigger set_created_by before insert on public.free_workouts for each row execute function public.set_created_by();

-- 5)
revoke execute on function public.client_staff_recipients(uuid) from anon, authenticated;
