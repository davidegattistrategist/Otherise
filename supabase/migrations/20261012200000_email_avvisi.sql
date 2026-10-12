begin;
-- Email degli avvisi: il titolare sceglie se riceverle (lui e i collaboratori)
-- e se mandarle ai clienti. Le notifiche nell'app e quelle sul telefono
-- restano sempre. Di serie: niente email allo staff (si vede tutto nell'app),
-- email ai clienti attive.
alter table public.app_settings add column if not exists staff_emails boolean not null default false;
alter table public.app_settings add column if not exists client_emails boolean not null default true;
commit;
