-- Le bozze di risposta ai clienti imparano dalle correzioni del trainer,
-- come le bozze dei programmi.
--
-- app_settings.ai_reply_lessons: come il trainer scrive a tutti i clienti
-- (lezioni ricavate dalle correzioni, una per riga). Le vede e corregge il titolare.
-- client_ai_profiles.reply_lessons: come scrive a QUESTO cliente (solo staff).
-- ai_reply_drafts.learned_at: quando la correzione è diventata lezione.

alter table public.app_settings add column if not exists ai_reply_lessons text not null default '';
alter table public.app_settings add column if not exists ai_reply_lessons_updated_at timestamptz;
alter table public.client_ai_profiles add column if not exists reply_lessons text not null default '';
alter table public.ai_reply_drafts add column if not exists learned_at timestamptz;
