begin;
-- Clienti "spot" o solo lezioni PT: sesso e durata delle fasi si possono
-- lasciare da decidere (vuoti). Il sesso serve solo per le pliche: senza, il
-- check chiede di indicarlo prima.
alter table public.clients alter column sex drop not null;
alter table public.clients alter column phase_weeks drop not null;
commit;
