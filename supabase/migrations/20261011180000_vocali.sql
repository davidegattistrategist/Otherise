-- Messaggi vocali in chat, con trascrizione automatica.
--
-- I vocali sono allegati "audio" nel bucket privato "chat" (come foto e video).
-- La trascrizione la fa il server con un servizio di trascrizione (Groq,
-- Whisper) e la salva qui: la vedono il cliente e lo staff che lo segue, la
-- scrive solo il server. Serve anche alle bozze di risposta dell'AI.

create table if not exists public.message_transcripts (
  message_id uuid primary key references public.messages (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- pending = in corso, done = pronta, failed = non riuscita, off = trascrizione non attiva
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'off')),
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_transcripts_client_idx on public.message_transcripts (client_id);

alter table public.message_transcripts enable row level security;
drop policy if exists message_transcripts_read on public.message_transcripts;
create policy message_transcripts_read on public.message_transcripts for select to authenticated
  using (public.can_manage_client(client_id) or public.is_client_self(client_id));

revoke all on public.message_transcripts from anon;
revoke insert, update, delete on public.message_transcripts from authenticated;
grant select on public.message_transcripts to authenticated;
grant all on public.message_transcripts to service_role;

-- il bucket della chat accetta anche l'audio dei vocali
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets
    set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
                                   'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
                                   'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav']
    where id = 'chat';
  end if;
end $$;
