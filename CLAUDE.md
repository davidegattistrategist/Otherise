@AGENTS.md

# Otherise — istruzioni per Claude

App per personal trainer: staff (titolare + collaboratori) gestisce clienti, programmi, check corporei, sessioni PT, posturale, pagamenti e check-up settimanali; il cliente vede il proprio percorso e registra il logbook. Ogni personal trainer ha **la propria installazione** (proprio GitHub, Supabase, Vercel, chiave Anthropic). Interfaccia e testi **in italiano**; chi la usa non è tecnico.

## Stack
- Next.js 16 App Router (`src/app`), React 19, Tailwind 4, TypeScript. **Leggi `node_modules/next/dist/docs/` prima di usare API di Next**: `proxy.ts` sostituisce il middleware, `params`/`searchParams`/`cookies()` sono Promise.
- Supabase (Postgres + Auth) con `@supabase/ssr`. Client: `src/lib/supabase/{server,browser,admin}.ts`. `admin` usa la service role e salta i permessi: usalo solo lato server e solo quando serve (inviti, notifiche, cron).
- Anthropic SDK per l'assistente (`src/lib/ai/`), structured outputs JSON.
- Test: Vitest (`src/lib/lib.test.ts`, calcoli), test di permessi su DB vero (`tests/integration`), Playwright (`tests/e2e`).

## Comandi
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test`
- `npm run test:integration` (serve un Supabase di prova VUOTO: variabili `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_KEY`)
- Dati finti per prove: `npx tsx scripts/seed-demo.ts` su un database di prova vuoto (mai su quello vero)
- Tipi del database: `npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/database.types.ts`

## Regole importanti
- **Permessi nel database (RLS)**, non solo nell'interfaccia. Funzioni helper in SQL: `is_owner()`, `is_staff()`, `can_manage_client(id)`, `is_client_self(id)`, `my_client_id()`. Il collaboratore vede solo i clienti con `coach_id` = lui; solo il titolare vede pagamenti, impostazioni, collaboratori.
- Il cliente **non deve mai vedere**: note delle sessioni PT (`pt_sessions`), `checks.notes_next_phase`, note private, bozze, valutazioni posturali non visibili. I check li legge solo con la funzione `my_checks()`.
- Il ruolo di un nuovo utente lo decide il trigger `handle_new_user` (primo utente = titolare; email in `staff_invites` = collaboratore; email di un cliente = cliente; altrimenti `none`). Mai fidarsi di dati inviati dal browser per il ruolo.
- **Modifiche al database**: mai cambiare migrazioni già eseguite. Aggiungi un nuovo file `supabase/migrations/AAAAMMGGhhmmss_descrizione.sql`, aggiorna i tipi, aggiungi/aggiorna i test di permesso, e **di' all'utente** che deve eseguire quel file nel SQL Editor di Supabase.
- Nessun dato reale di clienti nel codice, nei test o nei commit: solo persone inventate.
- All'assistente AI non si mandano nome, cognome, email o telefono del cliente (`src/lib/ai/context.ts`).
- Testi per l'utente: italiano semplice, dare del tu, niente gergo tecnico. Messaggi d'errore che dicono cosa fare.

## Dove stanno le cose
- Programma = JSON in `programs.content`: giorni → blocchi (`single`, `superset`, `circuit`, `amrap`, `emom`, `interval`, `text`) → esercizi con una prescrizione per settimana. Schema e helper in `src/lib/program/types.ts`. Gli id (nanoid) restano stabili: il logbook (`workout_logs`, `exercise_logs`) si aggancia a `day_id` e `item_id`.
- Prescrizioni ("4x8 60kg", "3x30\"") → `src/lib/program/prescription.ts`; righe del logbook → `logbook.ts`; calendario fasi → `schedule.ts`; nuova fase dal logbook → `next-phase.ts`.
- Pliche e composizione corporea: `src/lib/body/skinfolds.ts`. Uomo Jackson-Pollock 7 pliche; donna 5 pliche (senza pettorale e ascellare) riportate a 7 (×7/5) nella formula JP7 femminile; Siri. **Se manca una plica del protocollo non si calcola la percentuale.** Massimale stimato: tabella RPE in `src/lib/strength/e1rm.ts`.
- Pagamenti (fuori dall'app, qui solo il registro): `src/lib/billing.ts`, funzioni SQL `client_billing()` e `billing_overview()`.
- Check-up: soglie di avviso nella funzione SQL `flag_checkin` (voto ≤ 2, calo di 2 punti, richiesta scritta).
- Notifiche: tabella `notifications` (+ email via Resend in `src/lib/email.ts`; + push in `src/lib/push.ts`, inviate da `notify()` e per ogni messaggio da `sendMessage`); controlli giornalieri in `src/lib/daily-checks.ts` chiamati da `/api/cron/daily` (Vercel Cron, `vercel.json`, header `Authorization: Bearer CRON_SECRET`).
- Chat: tabelle `messages` e `chat_reads`, funzione `my_unread_chats()`. Allegati (solo foto e video, niente audio) nel bucket privato `chat` di Supabase Storage: il browser carica direttamente con un link firmato (`prepareUpload` in `src/app/chat/actions.ts`), i link di lettura sono firmati e temporanei (`src/lib/chat.ts`). Aggiornamento ogni 4 secondi da `/api/chat/[clientId]`.
- Logbook condiviso tra cliente e staff: `src/components/logbook/` (+ `src/lib/data/session.ts` per i dati: ultima volta, record, massimali per le prescrizioni in %).
- Progressioni senza AI: `src/lib/program/progression.ts`; record e massimali dal logbook (Epley): `src/lib/strength/records.ts`; costanza: `src/lib/compliance.ts`; grafici esercizi e allenamenti per settimana: `src/lib/data/progress.ts`.
- Pagamenti rapidi, WhatsApp e incassi: `src/lib/data/billing.ts`, `src/lib/whatsapp.ts`, `src/components/quick-pay.tsx`, export CSV in `/api/pagamenti/export`.
- AI: bozza/modifica programma `/api/ai/program`, riassunto check-up `/api/ai/checkin`, tetto di spesa in `src/lib/ai/budget.ts`.
- Bozze di risposta ai clienti (chat e richieste del check-up): tabella `ai_reply_drafts` (solo staff), generatore `src/lib/ai/reply.ts` (parte con `after()` da `sendMessage` e dall'invio del check-up), funzioni pure in `src/lib/reply-draft.ts`. Lo stile si impara da messaggi veri e coppie bozza → testo inviato, su due livelli (`styleSections`): abitudini comuni a più clienti e tono con il singolo cliente, che vince. Mai inviare da soli.
- Previsione incassi: `src/lib/forecast.ts` (+ `src/lib/data/forecast.ts`), pagina `/staff/pagamenti/previsione` (solo titolare).
- Privacy: informativa in `src/components/privacy-notice.tsx` (pagina pubblica `/privacy`, modulo cartaceo `/privacy/modulo`), versione in `src/lib/privacy.ts` (`PRIVACY_VERSION`: se cambi il testo in modo sostanziale aumentala, ai clienti viene richiesta la conferma). Il cliente senza consenso viene mandato a `/consenso` dal layout `src/app/cliente/layout.tsx`. Consensi del cliente solo tramite le funzioni SQL `accept_privacy` e `withdraw_health_consent`. L'assistente AI è compreso nel servizio (informativa punto 4 e testo del consenso): il cliente non può disattivarlo (tolto con la migrazione `20261011001500_ai_sempre_attiva.sql`). Export dati cliente: `/api/clienti/[id]/export` (solo titolare).
- Progetto annuale del cliente: tabella `client_projects` (JSON validato da `src/lib/project.ts`), editor in `src/app/staff/clienti/[id]/progetto/`, timeline `src/components/project-timeline.tsx`; il cliente lo legge solo se `visible`. L'AI lo riceve in `buildClientContext`.
- Prossimo allenamento in sequenza (mai giorni fissi): `nextWorkout` in `src/lib/program/schedule.ts`. Durata fasi del cliente: `clients.phase_weeks`; tempo per seduta: `programs.session_minutes`.
- Dolori nel logbook: `workout_logs.discomfort` (+ `discomfort_seen_at`), avviso allo staff in `src/components/logbook/actions.ts`, card "Dolori e fastidi" in Oggi. L'AI non interviene sui dolori (regole in `SYSTEM` di `src/lib/ai/claude.ts`).
- Domande dell'AI prima della bozza: `askQuestions` (mode "questions" in `/api/ai/program`), da 0 a 5, il meno possibile; se manca il tempo per seduta la prima è `TIME_QUESTION` e la risposta (o un tempo scritto dal trainer, `timeFromTrainer`) aggiorna il riferimento del cliente.
- Indicazioni per l'AI sul cliente: tabella `client_ai_profiles` (solo staff), logica pura in `src/lib/ai-profile.ts` (`profileText`, `autoUpdate` alla pubblicazione), dati in `src/lib/data/ai-profile.ts`, scheda in `staff/clienti/[id]/programma`. Com'è fatto un programma (serie per tipo di movimento dai nomi, accosciata/hinge, minuti stimati per giornata): `src/lib/program/balance.ts`; l'AI lo riceve in `buildClientContext` (parametro `reference`).
- Metodo di Davide (testo da incollare in Impostazioni, usato anche dal seed): `docs/METODO-BOZZA.md`.
- Bozza AI in una sola chiamata (`draftProgram` in `claude.ts`, schema `DRAFT_SCHEMA`: domande oppure programma); messaggio in tre parti con cache (metodo/lezioni/esempi/eserciziario → cliente e programma → richiesta), esercizi con codici corti "E12" e programma in JSON compatto (`src/lib/ai/prompt-format.ts`). Non cambiare system prompt o schema tra domande e bozza: invaliderebbe la cache.
- L'AI impara: `program_ai_drafts` (bozza salvata da `recordDraft`), confronto con il programma pubblicato o ritoccato (`compareWithDraft`, diff in `src/lib/program/diff.ts`), lezioni in `app_settings.ai_lessons` aggiornate da `learnPending` (`src/lib/ai/learn.ts`); scheda in Impostazioni con l'andamento delle correzioni.
- Pacchetti chiusi a mano: `payment_plans.sessions_written_off` (sommate alle usate in `client_billing`/`billing_overview`).
- Aggiornamento dal vivo: `/api/live` (conteggi e ultima notifica) chiamato ogni 20 s da `LiveProvider` in `src/components/live.tsx` (campanella, badge chat, avviso a comparsa).
- PWA: `public/sw.js` (push e clic sulle notifiche), `src/app/manifest.ts`, icone PNG in `public/`. Iscrizioni push in `push_subscriptions` (le scrive solo il server, `src/app/push/actions.ts`), chiavi VAPID generate da sole in `app_secrets` (o `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). Guida "Metti l'app sulla Home" al primo accesso da telefono: `src/components/install-guide.tsx`. Margini sicuri del telefono: variabili `--edge-left/right`, `--nav-gap`, `--nav-space` in `globals.css` (usale per tutto ciò che è fisso in basso).
- Variabili d'ambiente: vedi `docs/GUIDA-INSTALLAZIONE.md` passo 5.

## Prima di dire "fatto"
`npm run typecheck && npm run lint && npm test && npm run build`. Se tocchi permessi o SQL, anche i test di integrazione. Se tocchi pagine, aprile nel browser (anche a larghezza telefono, 390px) e lancia i test end-to-end (`npx playwright test`, progetti "pc" e "telefono"; servono i dati di `scripts/seed-demo.ts`).
Le stesse schermate hanno spesso due versioni (telefono e computer) nascoste con le classi `md:hidden` / `hidden md:block`: nei test usa `.filter({ visible: true })`.
