# Guida all'installazione di Otherise

Questa guida porta l'app online **sui tuoi account**: il codice su GitHub, il database su Supabase, il sito su Vercel, l'assistente AI su Anthropic. Nessuno oltre a te (e a chi inviti) vede i dati dei tuoi clienti.

Tempo: circa un'ora e mezza la prima volta. Non serve saper programmare: si tratta di creare account, copiare e incollare.

> **Se ti blocchi**: apri Claude (claude.ai) e incolla il messaggio che trovi in fondo a questa guida, nella sezione "Farsi aiutare da Claude". Puoi mandargli anche gli screenshot di quello che vedi.

---

## 0. Cosa ti serve

| Servizio | A cosa serve | Costo indicativo* |
|---|---|---|
| **GitHub** | Custodisce il codice dell'app | Gratis |
| **Supabase** | Database e accessi (email e password) | Gratis per iniziare; il piano Pro (circa 25 $/mese) aggiunge i backup giornalieri, consigliato quando ci sono i dati veri dei clienti |
| **Vercel** | Mette online il sito | Piano Pro (circa 20 $/mese): il piano gratuito è solo per uso non commerciale |
| **Anthropic** | L'assistente AI che prepara le bozze dei programmi | A consumo: pochi euro al mese; nell'app c'è un tetto di spesa |
| **Resend** | Manda le email (inviti, avvisi) dal tuo dominio | Gratis fino a 3.000 email al mese |
| **Dominio** | L'indirizzo dell'app, es. `app.tuodominio.it` | Quello che hai già, o 10–15 €/anno |

\* I prezzi cambiano: controllali sui siti prima di attivare.

Tieni aperto un file di note (anche sul telefono) dove incollare man mano le **chiavi** che raccogli: ti serviranno tutte al passo 5. Le chiavi sono come password: non mandarle a nessuno e non metterle in chat.

---

## 1. GitHub: il codice

1. Crea un account su <https://github.com> (se non ce l'hai).
2. Crea un repository vuoto: in alto a destra **+ → New repository**.
   - Nome: `otherise`
   - Seleziona **Private**
   - Non aggiungere README né altro, poi **Create repository**.
3. Nel repository appena creato: **Settings → Collaborators → Add people** e aggiungi Davide (`davidegattistrategist`).
4. Scrivi a Davide: copierà lui il codice nel tuo repository. Quando ha fatto, vedrai i file comparire.

Da quel momento il codice è tuo. Quando Davide migliora l'app, può mandarti gli aggiornamenti nello stesso modo (vedi "Aggiornamenti" in fondo).

---

## 2. Supabase: il database

1. Crea un account su <https://supabase.com> (puoi entrare con GitHub).
2. **New project**:
   - Name: `otherise`
   - Database password: generane una e salvala nelle note
   - Region: **Central EU (Frankfurt)** — i dati restano in Europa
   - **Create new project** e aspetta un paio di minuti.
3. **Crea le tabelle.** Nel menu a sinistra apri **SQL Editor** → **New query**. Apri sul tuo GitHub il file `supabase/migrations/20261009120000_schema.sql`, premi il pulsante "Copy raw file", incolla tutto nell'editor di Supabase e premi **Run**. Deve comparire "Success. No rows returned". Lo stesso script prepara anche lo spazio privato per le foto e i video della chat: in **Storage** deve comparire un contenitore chiamato `chat`.
4. **Chiudi le iscrizioni libere** (nell'app si entra solo su invito): **Authentication → Sign In / Providers** → disattiva **Allow new users to sign up** → Save.
5. **Indirizzi dell'app**: **Authentication → URL Configuration**
   - Site URL: `https://app.tuodominio.it` (l'indirizzo che userai; se non hai ancora il dominio metti per ora quello che ti darà Vercel al passo 5 e cambialo dopo)
   - Redirect URLs → Add URL: `https://app.tuodominio.it/**`
6. **Email in italiano**: **Authentication → Emails** (o "Email Templates"):
   - **Invite user** → oggetto `Il tuo accesso all'app` → incolla il testo del file `supabase/email-templates/invito.html`
   - **Reset password** → oggetto `Scegli una nuova password` → incolla il testo di `supabase/email-templates/nuova-password.html`
   - Salva entrambi.
7. **Le chiavi**: **Project Settings → API Keys** (o "API"). Copia nelle note:
   - **Project URL** (es. `https://abcd1234.supabase.co`)
   - la chiave **publishable** (o "anon public")
   - la chiave **secret** (o "service_role") — è la più delicata: dà accesso a tutto.

L'invio delle email lo sistemiamo al passo 4 con Resend: il servizio email incluso in Supabase manda pochissime email l'ora ed è solo per le prove.

---

## 3. Anthropic: l'assistente AI

1. Crea un account su <https://console.anthropic.com>.
2. **Billing**: aggiungi una carta e un po' di credito (10–20 € bastano per mesi di bozze). Imposta anche un limite di spesa mensile.
3. **API Keys → Create Key**, nome `otherise`. Copia la chiave nelle note (inizia con `sk-ant-`): la vedi una volta sola.

Per tua tranquillità: i dati mandati all'assistente non vengono usati per addestrare i modelli, e l'app non manda mai nome e cognome dei clienti, solo i dati di allenamento.

---

## 4. Resend: le email (consigliato)

Senza questo passo l'app funziona lo stesso, ma inviti e avvisi via email partono poco o niente.

1. Crea un account su <https://resend.com>.
2. **Domains → Add Domain** → scrivi il tuo dominio (es. `tuodominio.it`). Resend ti mostra alcuni record DNS: aggiungili dal pannello di chi ti vende il dominio (Aruba, Register, GoDaddy…). Se non sai come, manda a Claude lo screenshot dei record e il nome del tuo provider. Aspetta che il dominio risulti **Verified**.
3. **API Keys → Create API Key** (permesso "Sending access"). Copiala nelle note.
4. Collega Resend anche a Supabase, così inviti e "password dimenticata" partono dal tuo dominio: in Supabase **Project Settings → Authentication → SMTP Settings** (o **Authentication → Emails → SMTP**) → attiva **Custom SMTP**:
   - Sender email: `noreply@tuodominio.it` · Sender name: il nome della tua attività
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend` · Password: la chiave API di Resend
   - Save.

---

## 5. Vercel: mettere online l'app

1. Crea un account su <https://vercel.com> entrando **con GitHub**. Scegli il piano **Pro**.
2. **Add New → Project** → scegli il repository `otherise` → **Import**.
3. Prima di premere Deploy apri **Environment Variables** e aggiungi queste righe (nome a sinistra, valore a destra):

| Nome | Valore |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL di Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chiave publishable (o anon) di Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave secret (o service_role) di Supabase |
| `NEXT_PUBLIC_SITE_URL` | `https://app.tuodominio.it` (senza `/` finale) |
| `ANTHROPIC_API_KEY` | chiave di Anthropic |
| `RESEND_API_KEY` | chiave di Resend |
| `EMAIL_FROM` | `Nome Attività <avvisi@tuodominio.it>` |
| `CRON_SECRET` | una frase lunga a caso, es. 40 lettere e numeri inventati |

   Facoltative: `ANTHROPIC_MODEL` se un giorno vuoi cambiare il modello dell'assistente (senza, usa quello predefinito); `NEXT_PUBLIC_CHAT_MAX_VIDEO_MB` se con Supabase Pro alzi il limite dei file (vedi sotto).

4. **Deploy**. Dopo un paio di minuti l'app è online su un indirizzo tipo `otherise-xxx.vercel.app`.
5. **Il tuo dominio**: nel progetto Vercel **Settings → Domains → Add** → `app.tuodominio.it`. Vercel ti dice quale record DNS aggiungere (di solito un CNAME): aggiungilo dal pannello del dominio. Quando è attivo, controlla che Site URL e Redirect URLs su Supabase (passo 2.5) e `NEXT_PUBLIC_SITE_URL` su Vercel usino proprio questo indirizzo. Se cambi una variabile su Vercel, fai **Deployments → … → Redeploy**.

I controlli automatici giornalieri (scadenze, programmi in chiusura, promemoria del check-up) partono da soli ogni mattina alle 8: li attiva il file `vercel.json` insieme a `CRON_SECRET`.

---

## 6. Il primo accesso

Il **primo account creato diventa il titolare** (vede tutto). Crealo così:

1. Supabase → **Authentication → Users → Add user → Create new user**: la tua email, una password, spunta **Auto Confirm User** → Create.
2. Apri `https://app.tuodominio.it`, entra con email e password.
3. In **Impostazioni e metodo**:
   - scrivi il nome della tua attività;
   - incolla il testo di `docs/METODO-BOZZA.md` nel riquadro del metodo e **correggilo con il tuo modo di lavorare**: è quello che l'assistente AI legge ogni volta;
   - controlla il tetto di spesa AI e che i tre "Collegamenti" siano attivi.
4. **Eserciziario → Importa l'eserciziario Otherise** (circa 175 esercizi con video), poi aggiungi o correggi quello che vuoi.
5. **Clienti → Nuovo cliente** per ognuno; con l'email e la spunta "Invia subito l'invito" ricevono il link per scegliere la password.
6. **Collaboratori**: invita il collaboratore con la sua email; poi nella scheda di ogni cliente scegli chi lo segue.

Per importare le vecchie schede: apri la scheda Google del cliente, scegli la scheda (tab) della fase, **File → Scarica → Valori separati da virgole (.csv)**, poi nell'app: cliente → **Programma → Importa dal foglio Google**.

---

## 7. Aggiornamenti futuri

- **Codice**: Davide (o Claude, vedi `docs/COME-LAVORARE-CON-CLAUDE.md`) carica le modifiche sul tuo GitHub; Vercel rimette online la nuova versione da solo in un paio di minuti.
- **Database**: se un aggiornamento aggiunge un file nella cartella `supabase/migrations/`, va eseguito una volta nel **SQL Editor** di Supabase, come al passo 2.3 (solo il file nuovo, non quelli già eseguiti). Chi ti manda l'aggiornamento te lo dice.

## 8. Chat: foto e video

- I video della chat possono pesare al massimo 50 MB (circa 30–60 secondi girati col telefono): è il limite del piano gratuito di Supabase. Con il piano Pro puoi alzarlo in **Storage → Settings → Upload file size limit** e nel contenitore `chat` (**Storage → chat → Edit bucket**), poi su Vercel aggiungi `NEXT_PUBLIC_CHAT_MAX_VIDEO_MB` con il nuovo valore (es. `200`) e fai Redeploy.
- Le foto vengono ridotte automaticamente prima dell'invio, quindi occupano poco spazio. Messaggi vocali e audio non si possono mandare (scelta voluta).

## 9. Sicurezza e manutenzione

- Non condividere mai la chiave secret di Supabase né quella di Anthropic. Se pensi che una chiave sia uscita, rigenerala dal servizio e aggiornala su Vercel (poi Redeploy).
- Con il piano Free di Supabase **non ci sono backup automatici** e il progetto si mette in pausa se resta inattivo per una settimana (i controlli giornalieri lo tengono sveglio, ma non contarci). Con dati veri dei clienti passa al piano Pro.
- Leggi anche `docs/PRIVACY.md`.

---

## Farsi aiutare da Claude

Apri <https://claude.ai>, inizia una nuova chat e incolla questo messaggio (poi allega gli screenshot quando ti blocchi):

```
Ciao Claude. Sto installando un'app web chiamata Otherise per gestire i clienti
della mia attività di personal trainer. Non sono un programmatore: guidami un
passo alla volta, con parole semplici, e aspetta che ti dica "fatto" prima di
passare al passo successivo.

L'app è fatta con Next.js e usa:
- GitHub per il codice (repository privato "otherise" sul mio account)
- Supabase per database e accessi (regione Frankfurt)
- Vercel (piano Pro) per metterla online, con il mio dominio
- Anthropic per l'assistente AI, Resend per le email

Seguo la guida GUIDA-INSTALLAZIONE.md che trovi qui sotto. Sono al passo [N].
Quando ti mando uno screenshot dimmi esattamente dove cliccare.
Non chiedermi mai di incollare in chat le chiavi segrete: dimmi solo dove metterle.

[incolla qui il testo della guida]
```
