-- =====================================================================
-- Sessione PT registrata insieme all'allenamento del programma: la sessione
-- ricorda da quale allenamento viene (source = "programma:settimana:giorno"),
-- così salvando di nuovo l'allenamento non se ne crea una seconda.
-- =====================================================================
alter table public.pt_sessions add column if not exists source text;
create unique index if not exists pt_sessions_client_source_idx on public.pt_sessions (client_id, source);

-- =====================================================================
-- Nota finale del cliente nel logbook ("Com'è andata?"): un'AI leggera
-- decide se vale la pena che il trainer la legga (note_flag), con il motivo
-- in breve (note_reason). Il trainer la segna letta (note_seen_at).
-- null = non ancora valutata o niente da valutare.
-- =====================================================================
alter table public.workout_logs add column if not exists note_flag boolean;
alter table public.workout_logs add column if not exists note_reason text not null default '';
alter table public.workout_logs add column if not exists note_seen_at timestamptz;
