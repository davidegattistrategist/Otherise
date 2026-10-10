-- Notifiche push sul telefono e sul computer (app aggiunta alla schermata Home).
--
-- push_subscriptions: un indirizzo di consegna per ogni dispositivo su cui
-- qualcuno ha attivato le notifiche. Lo scrive solo il server (dopo aver
-- controllato chi è collegato); ognuno può leggere solo i propri.
--
-- app_secrets: chiavi interne dell'app create in automatico al primo uso
-- (es. le chiavi VAPID per le notifiche push). Nessun accesso dal browser:
-- le legge solo il server con la chiave secret.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
-- nessuna policy: dal browser non si legge né si scrive

revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;
grant select on public.push_subscriptions to authenticated;
revoke all on public.app_secrets from anon, authenticated;
grant all on public.push_subscriptions, public.app_secrets to service_role;
