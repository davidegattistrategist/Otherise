-- "Non senti X da N giorni": il trainer può rimandare il promemoria di 5 giorni
-- dalla card in Oggi. Se nel frattempo non vi siete scritti, il promemoria torna
-- con una nuova notifica. Solo lo staff che segue il cliente (il cliente non lo vede).
create table if not exists public.chat_snoozes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  until date not null,
  snoozed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chat_snoozes enable row level security;

drop policy if exists chat_snoozes_staff on public.chat_snoozes;
create policy chat_snoozes_staff on public.chat_snoozes for all to authenticated
  using (public.can_manage_client(client_id))
  with check (public.can_manage_client(client_id));

revoke all on public.chat_snoozes from anon;
grant select, insert, update, delete on public.chat_snoozes to authenticated;
grant all on public.chat_snoozes to service_role;
