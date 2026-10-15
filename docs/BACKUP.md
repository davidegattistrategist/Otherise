# Backup dei dati

Ogni notte GitHub fa una copia dei dati dell'app: clienti, programmi, check, logbook, pagamenti, messaggi scritti, impostazioni e accessi. **Una volta a settimana** (la domenica) copia anche **le foto dei check**, che sono dati sulla salute e stanno solo nello spazio file di Supabase (se attivi i due segreti in più, vedi sotto). Foto, video e vocali della chat restano fuori.

Come funziona (file `.github/workflows/backup.yml` e `scripts/backup/backup.sh`):
1. conta le righe di ogni tabella del database;
2. fa la copia;
3. **la ricarica su un database vuoto e ricontrolla che le righe siano le stesse**: se non tornano, il backup fallisce;
4. la cifra con la tua frase segreta e la conserva su GitHub per 30 giorni (Actions → "Backup notturno" → un'esecuzione → in fondo, "Artifacts").

**Ogni mattina l'app ti conferma com'è andata** con una notifica: "Backup di stanotte riuscito", insieme allo spazio usato da database e foto rispetto ai limiti del piano gratuito di Supabase (oltre l'80% ti avvisa che è ora di passare a Pro). Se il backup non è riuscito o non risulta, l'avviso arriva anche sul telefono. Lo stesso riepilogo, con le ultime notti, è in Impostazioni → Backup e spazio. Serve la tabella `backup_runs` (file `20261013140000_registro_backup.sql`): il backup ci scrive alla fine.

Se una notte qualcosa va storto (database in pausa o irraggiungibile, copia incompleta, segreti sbagliati) GitHub ti manda un'email. Controlla che in GitHub → Settings → Notifications → **Actions** sia attivo l'avviso via email per i workflow falliti.

## Attivarlo (una volta)
1. **La stringa di connessione del database.** In Supabase premi **Connect** (in alto) → scheda **Connection String** → tipo **URI**, metodo **Session pooler**. Copia l'indirizzo, che inizia con `postgresql://postgres.` e contiene `pooler.supabase.com:5432`, e al posto di `[YOUR-PASSWORD]` metti la password del database. Se non la ricordi, rigenerala da Project Settings → Database → **Reset database password**: l'app non la usa, quindi non si rompe nulla. Scegli una password fatta solo di lettere e numeri.
2. **La frase segreta.** Inventane una lunga (per esempio 5–6 parole a caso) e **salvala nel tuo gestore di password**: senza, i backup non si possono aprire.
3. In GitHub, nel repository dell'app: **Settings → Secrets and variables → Actions → New repository secret**. Creane due:
   - `BACKUP_DATABASE_URL` → l'indirizzo del punto 1
   - `BACKUP_PASSPHRASE` → la frase del punto 2
4. **Foto dei check (consigliato).** Crea altri due segreti nello stesso posto:
   - `BACKUP_SUPABASE_URL` → l'indirizzo del progetto Supabase (lo stesso di `NEXT_PUBLIC_SUPABASE_URL` su Vercel, es. `https://xxxx.supabase.co`)
   - `BACKUP_SERVICE_KEY` → la chiave secret (o service_role) di Supabase, la stessa di `SUPABASE_SERVICE_ROLE_KEY` su Vercel

   La domenica (o quando lanci il backup a mano) le foto vengono scaricate, controllate una per una, cifrate con la stessa frase segreta e conservate 35 giorni (artifact "foto-…").
5. **Actions → Backup notturno → Run workflow** per provarlo subito. Deve finire con la spunta verde e il riepilogo "OK: tutte le … tabelle hanno le stesse righe".

## Ripristinare
Si fa raramente e con calma: chiedi a Claude, che segue questi passi.
1. Scarica l'artifact della notte giusta e aprilo: `gpg -d otherise-AAAA-MM-GG.dump.gpg > otherise.dump` (chiede la frase segreta).
2. Ripristino completo su un progetto Supabase nuovo (o svuotato): `pg_restore --no-owner --no-privileges -n public -d "<stringa di connessione>" otherise.dump`, poi gli accessi con `pg_restore --no-owner --no-privileges --data-only -t users -t identities -n auth -d "<stringa>" otherise.dump`.
3. Foto dei check: `gpg -d otherise-foto-AAAA-MM-GG.tgz.gpg | tar xz` → cartella `foto/<cliente>/<check>/…`, da ricaricare nel contenitore `checks` di Supabase Storage con gli stessi percorsi.
4. Per recuperare solo qualche dato (per esempio un cliente eliminato per sbaglio) si ricarica la copia su un database di prova e si copiano a mano solo le righe che servono.
