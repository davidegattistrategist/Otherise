-- Pliche che non sempre si riescono a prendere: più formule e una formula di
-- riferimento per cliente (così i grafici restano confrontabili nel tempo).
--
-- clients.skinfold_formula: formula scelta dal trainer (vuota = automatica,
--   la più completa utilizzabile in tutti i check del cliente)
-- checks.body_fat_formula: formula usata per la % salvata nel check
-- checks.order_hint: solo per i check storici senza data, la posizione nel
--   tempo (non si mostra e non entra nei grafici)

alter table public.clients add column if not exists skinfold_formula text
  check (skinfold_formula is null or skinfold_formula in ('m7', 'm3_pts', 'm3_pac', 'f5', 'f3_tsa', 'f3_tsc'));

alter table public.checks add column if not exists body_fat_formula text
  check (body_fat_formula is null or body_fat_formula in ('m7', 'm3_pts', 'm3_pac', 'f5', 'f3_tsa', 'f3_tsc'));

alter table public.checks add column if not exists order_hint date;

-- i check salvati finora usavano la formula completa del protocollo
update public.checks set body_fat_formula = case when sex = 'M' then 'm7' else 'f5' end
where body_fat_pct is not null and body_fat_formula is null;
