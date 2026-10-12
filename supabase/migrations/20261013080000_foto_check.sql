-- =====================================================================
-- Foto dei check (frontale, laterali, dietro...): le carica lo staff dalla
-- galleria del telefono dentro un check. Il cliente le vede nei Progressi solo
-- per i check che può vedere (visibili e con la data), tramite my_check_photos().
-- I file stanno nel bucket privato "checks" e si leggono con link temporanei.
-- =====================================================================
create table if not exists public.check_photos (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  path text not null unique,
  thumb_path text not null unique,
  width int,
  height int,
  size_bytes int,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists check_photos_check_idx on public.check_photos (check_id, sort_order);
create index if not exists check_photos_client_idx on public.check_photos (client_id);

alter table public.check_photos enable row level security;

drop policy if exists check_photos_staff on public.check_photos;
create policy check_photos_staff on public.check_photos for all to authenticated
  using (public.can_manage_client(client_id))
  with check (
    public.can_manage_client(client_id)
    and exists (select 1 from public.checks c where c.id = check_id and c.client_id = check_photos.client_id)
    and path like client_id::text || '/' || check_id::text || '/%'
    and thumb_path like client_id::text || '/' || check_id::text || '/%'
  );

-- Il cliente: solo le foto dei suoi check visibili e con la data
create or replace function public.my_check_photos()
returns table (id uuid, check_id uuid, check_date date, path text, thumb_path text, width int, height int, sort_order int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.check_id, c.check_date, p.path, p.thumb_path, p.width, p.height, p.sort_order, p.created_at
  from public.check_photos p
  join public.checks c on c.id = p.check_id
  where p.client_id = public.my_client_id() and public.is_client_self(p.client_id)
    and c.visible_to_client and c.check_date is not null
  order by c.check_date desc, p.sort_order, p.created_at
$$;
revoke execute on function public.my_check_photos() from anon, public;
grant execute on function public.my_check_photos() to authenticated, service_role;
revoke all on public.check_photos from anon;
grant select, insert, update, delete on public.check_photos to authenticated;
grant all on public.check_photos to service_role;

-- Bucket privato per le foto dei check (solo dove c'è lo storage di Supabase)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('checks', 'checks', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
