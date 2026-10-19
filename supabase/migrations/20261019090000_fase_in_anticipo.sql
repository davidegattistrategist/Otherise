-- Iniziare in anticipo una fase nuova (es. la domenica quella che parte il lunedì).
--
-- Il cliente non può modificare i programmi: questa funzione cambia solo la
-- data di inizio, solo di una sua fase pubblicata che parte entro 3 giorni, e
-- la porta a oggi (ora italiana). Lo staff può farlo per i clienti che segue.
-- Restituisce la data di inizio (oggi, o quella di prima se era già iniziata).

create or replace function public.start_program_early(pid uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  today date := (now() at time zone 'Europe/Rome')::date;
begin
  select id, client_id, status, start_date into p from public.programs where id = pid;
  if p.id is null or p.status <> 'published' or p.start_date is null then
    raise exception 'fase non trovata' using errcode = 'P0002';
  end if;
  -- coalesce: chi non è un cliente ha my_active_client_id() vuoto, e "vuoto" non deve valere come sì
  if not (coalesce(p.client_id = (select public.my_active_client_id()), false) or coalesce(public.can_manage_client(p.client_id), false)) then
    raise exception 'non permesso' using errcode = '42501';
  end if;
  if p.start_date <= today then
    return p.start_date;
  end if;
  if p.start_date - today > 3 then
    raise exception 'troppo presto' using errcode = '22023';
  end if;
  update public.programs set start_date = today where id = pid;
  return today;
end
$$;

revoke all on function public.start_program_early(uuid) from public, anon;
grant execute on function public.start_program_early(uuid) to authenticated;
