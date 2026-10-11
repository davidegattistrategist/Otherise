-- Indicazioni per l'assistente AI sul singolo cliente (solo staff: il cliente
-- non le vede). Sono un punto di partenza, non regole fisse: l'AI segue
-- comunque il programma più recente scritto dal trainer, e alcune si
-- aggiornano da sole quando il trainer pubblica un programma diverso.

create table if not exists public.client_ai_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- tempo per seduta di riferimento (minuti)
  session_minutes int check (session_minutes is null or session_minutes between 15 and 240),
  strength_level text check (strength_level is null or strength_level in ('principiante', 'intermedio', 'avanzato')),
  running_level text check (running_level is null or running_level in ('nessuno', 'principiante', 'intermedio', 'avanzato')),
  -- spinte verticali: si, poche, no (null = decide il programma)
  vertical_push text check (vertical_push is null or vertical_push in ('si', 'poche', 'no')),
  -- % di accosciata sul lavoro gambe (il resto è hinge); null = segue il programma
  squat_share int check (squat_share is null or squat_share between 0 and 100),
  intensity_techniques boolean,
  notes text not null default '',
  -- ultima modifica automatica (es. "Accosciata/hinge aggiornato dal programma …")
  auto_note text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.client_ai_profiles enable row level security;
drop policy if exists client_ai_profiles_staff on public.client_ai_profiles;
create policy client_ai_profiles_staff on public.client_ai_profiles for all to authenticated
  using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

revoke all on public.client_ai_profiles from anon;
grant select, insert, update, delete on public.client_ai_profiles to authenticated;
grant all on public.client_ai_profiles to service_role;

-- il tempo per seduta già scritto nell'ultimo programma diventa il riferimento
insert into public.client_ai_profiles (client_id, session_minutes)
select distinct on (p.client_id) p.client_id, p.session_minutes
from public.programs p
where p.client_id is not null and p.session_minutes is not null
order by p.client_id, p.updated_at desc
on conflict (client_id) do nothing;
