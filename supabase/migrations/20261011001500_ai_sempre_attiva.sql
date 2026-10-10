-- L'assistente AI fa parte del servizio (informativa e consenso iniziale):
-- il cliente non può più disattivarlo dall'app. Via la colonna e la funzione.
drop function if exists public.set_ai_opt_out(boolean);
alter table public.clients drop column if exists ai_opt_out;
