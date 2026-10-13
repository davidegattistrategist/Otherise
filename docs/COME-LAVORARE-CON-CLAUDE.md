# Come lavorare con Claude (mini guida)

Claude ti serve in due modi: **dentro l'app** (l'assistente che prepara i programmi) e **fuori**, per modificare l'app stessa o farti aiutare con qualsiasi cosa. Questa guida è sul secondo, con qualche trucco che vale per entrambi.

## Le regole che fanno la differenza

1. **Dagli il contesto, non solo la domanda.** Claude non sa chi sei né cosa stai facendo finché non glielo dici. Invece di "come faccio a cambiare il colore?" scrivi: "Ho un'app Next.js su Vercel per i miei clienti di personal training. Vorrei che il pulsante 'Pubblica' fosse arancione invece che nero. Il codice è nel mio GitHub."
2. **Di' cosa vuoi ottenere, non come farlo.** "Voglio che i clienti vedano anche il tempo di recupero accanto a ogni esercizio" è meglio di "aggiungi un campo nel database". Claude sceglie il come, tu giudichi il risultato.
3. **Mostra.** Uno screenshot vale dieci righe. Se qualcosa non funziona: screenshot + cosa hai fatto + cosa ti aspettavi.
4. **Un passo alla volta.** Per cose lunghe chiedi prima un piano ("prima di fare, dimmi come lo faresti"), poi approvalo, poi fallo eseguire.
5. **Correggi senza paura.** Se il risultato non va, di' cosa non va e perché, come faresti con un collaboratore: "troppo complicato", "il cliente non capirebbe questa parola", "manca il caso del pacchetto di sessioni".
6. **Fai verificare.** "Controlla che funzioni anche da telefono", "prova il caso in cui il cliente non ha ancora un programma". Claude sa provare il proprio lavoro se glielo chiedi.
7. **Mai segreti in chat.** Chiavi, password e dati dei clienti non si incollano. Se serve un esempio, inventa i dati ("Mario Rossi, 35 anni…").

## Pensa in grande, lascia fare a Claude

- **Il limite è la fantasia.** Se riesci a descrivere una cosa (una pagina, un avviso, un grafico, un modo nuovo di seguire i clienti), Claude la può costruire. Non chiederti "si può fare?", chiediti "cosa mi servirebbe?".
- **Sogna in grande, poi scegli il primo passo.** "Come sarebbe perfetto?" e poi "cosa facciamo oggi?".
- **Tieni una lista dei desideri.** Ogni idea che ti viene durante la giornata va lì; ogni tanto chiedi a Claude di metterla in ordine.
- **Collega i connettori** (GitHub, Supabase, Vercel, Google Drive, Gmail, Calendar…): così Claude carica, pubblica, controlla e prova da solo, e tu guardi il risultato e decidi. Le cose che costano, cancellano dati o scrivono ai clienti le confermi sempre tu.

## Modificare l'app con Claude Code

Claude Code è la versione di Claude che lavora direttamente sul codice: legge il progetto, fa le modifiche, le prova e le carica su GitHub. Vercel poi pubblica da solo.

1. Su <https://claude.ai/code> collega il tuo account GitHub e scegli il repository `otherise`.
2. Chiedi quello che vuoi in italiano. Esempio:
   > Nella pagina "Oggi" dello staff vorrei vedere anche i clienti che compiono gli anni questa settimana. Prima dimmi cosa cambieresti, poi fallo.
3. Claude legge da solo il file `CLAUDE.md` del progetto, dove sono scritte le regole dell'app (permessi, formule, convenzioni). Non devi spiegargliele ogni volta.
4. Quando ha finito chiedigli di **aprire una pull request** invece di modificare direttamente: la vedi su GitHub, e se va bene premi "Merge". Se la modifica tocca il database, Claude deve dirti quale file eseguire nel SQL Editor di Supabase (vedi la guida di installazione, "Aggiornamenti").

Cose utili da chiedere:
- "Spiegami come funziona [parte dell'app] come se non fossi un programmatore."
- "C'è un errore: [screenshot]. Trova la causa prima di correggere."
- "Aggiungi un test che controlli che un collaboratore non veda i pagamenti."
- "Ripassa tutto quello che hai cambiato e dimmi se c'è qualcosa di rischioso."

## Usare bene l'assistente dentro l'app

- **Il metodo in Impostazioni è il suo manuale.** Scrivilo come lo spiegheresti a un nuovo collaboratore bravo ma che non ti conosce: come imposti le fasi, come progredisci, cosa eviti, come scrivi le prescrizioni. Rileggilo ogni tanto e aggiungi quello che correggi spesso nelle bozze.
- **Segna 2–3 programmi come "esempio del mio stile"**: valgono più di molte parole.
- **Le richieste brevi funzionano.** Detta mentre sistemi i pesi: *"stessa struttura, passiamo a forza: 5x5 sui fondamentali, complementari 3x8, togli il circuito del giorno 3, aggiungi lavoro per le spalle che sono rigide"*.
- **Usa le note di sessione e il diario**: l'assistente li legge. Se scrivi "ginocchio sinistro fastidioso negli affondi", la bozza successiva ne terrà conto.
- **Rivedi sempre.** L'assistente prepara, tu decidi: le righe cambiate sono evidenziate con il motivo, e niente arriva al cliente finché non premi Pubblica.
