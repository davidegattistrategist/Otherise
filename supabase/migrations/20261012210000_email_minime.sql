begin;
-- Email il meno possibile: al massimo una al giorno per persona (con tutte le
-- novità insieme) e solo a chi non ha attivato le notifiche sul telefono.
-- Qui si segna quando è partita l'ultima.
alter table public.profiles add column if not exists last_email_at timestamptz;
commit;
