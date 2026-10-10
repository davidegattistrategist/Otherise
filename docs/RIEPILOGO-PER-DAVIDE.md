# Riepilogo per Davide — prima versione di Otherise

## Cosa c'è
**Area staff** (titolare e collaboratori)
- "Oggi": check-up da guardare, programmi in chiusura o da pubblicare, pagamenti, check da fare.
- Clienti: lista con ricerca e archivio; scheda con Panoramica, Programma, Sessioni PT, Check, Posturale, Pagamenti (solo titolare), Check-up, Scheda.
- Check corporei: pliche (fino a 3 misure per sito), JP7 uomo / 5 pliche donna, Siri, massa grassa e magra, circonferenze, test di forza con massimale stimato (tabella RPE), test liberi, note per la prossima fase (riservate), grafici.
- Editor programmi: griglia esercizi × settimane, blocchi singolo/superserie/circuito/AMRAP/EMOM/intervalli/testo, copia settimana, ultimo log sotto ogni esercizio, Ctrl+S, bozza/pubblicato/archiviato, modelli, "nuova fase" che riparte dal logbook reale, import delle schede Google (CSV), eserciziario con 175 esercizi e video dal tuo foglio.
- Assistente AI: bozza o modifica del programma da testo/dettatura/foto, "Progredisci" e "Alternative" sulla riga; usa metodo scritto, programmi d'esempio, eserciziario e storico del cliente (senza nome); righe cambiate evidenziate con il motivo; registro dei costi e tetto mensile.
- Pagamenti: piani (mensile, 6 settimane, trimestrale, semestrale, annuale, pacchetto, singola), registrazione con periodo proposto, stato e scadenze, pacchetti che scalano con le sessioni PT, promemoria manuale e automatico, panoramica con incassi.
- Collaboratori: invito, rimando invito, revoca (i clienti tornano al titolare).
- Notifiche in app + email (Resend), controlli automatici ogni mattina (Vercel Cron).

**Area cliente** (da telefono)
- Oggi: prossimo allenamento, avanzamento fase, composizione corporea, stato del percorso, risposta del coach, invito al check-up.
- Programma per settimane con video; logbook con serie/kg/ripetizioni, "fatto come scritto", timer di recupero, ultima volta, salvataggio automatico e bozza locale se salta la rete.
- Progressi (grafici, test, posturale visibile, andamento check-up), Percorso (fasi, sessioni, pagamenti, cambio password), Check-up settimanale.

## Seconda passata (9 ottobre, sera)
Confronto con le app più usate dai coach (Trainerize, TrueCoach, Everfit, TrainHeroic, Hevy, CoachRx, Harbiz, MyPTHub) e migliorie applicate:
- **Chat** cliente ↔ staff con foto e video (niente audio), non letti, notifiche.
- **Programmi**: progressione automatica per riga o per giorno (+1 ripetizione, +2,5/5 kg, +% massimale, +1 serie, scarico finale), prescrizioni in % del massimale calcolate per ogni cliente, editor a settimane dal telefono, richieste rapide per l'AI, riassunto AI dei check-up con bozza di risposta.
- **Logbook**: valori già proposti (programma o ultima volta), "Nuovo record!", timer ±15 s, schermo sempre acceso; lo staff può registrare al posto del cliente.
- **Pagamenti**: "Pagato" in un tocco da Oggi e da Pagamenti, promemoria WhatsApp già scritto (testo modificabile), incassi per mese, entrate attese a 30 giorni, export CSV per il commercialista.
- **Avvisi**: un'unica email di riepilogo al mattino per lo staff; clienti che non si allenano da 7 giorni o con costanza sotto il 50%; costanza nella lista clienti.
- **Grafici**: andamento del massimale stimato per esercizio, allenamenti per settimana, record del cliente.
- **Telefono**: menu in basso per lo staff, lista clienti compatta, nessuna pagina più larga dello schermo.
- Corretti nel collaudo: salvataggio dopo la bozza AI (dava "modificato da qualcun altro"), conferma del piano di pagamento, messaggio "Salvato" che spariva nell'editor, dimensioni dei testi di pulsanti e campi (una regola CSS le annullava).

## Terza passata (9-10 ottobre, notte)
- **Le tue risposte** applicate:
  - pacchetti chiusi a mano ("Segna il pacchetto come terminato", si può annullare);
  - il titolare vede anche le chat dei collaboratori;
  - WhatsApp senza invio automatico;
  - nessuna ricevuta o fattura.
- **Privacy completa**:
  - informativa definitiva (da far rileggere a un legale) con i dati del titolare dalle Impostazioni;
  - consenso esplicito al primo accesso o modulo cartaceo;
  - uso dell'AI dichiarato nell'informativa e compreso nel consenso iniziale;
  - richieste di copia o cancellazione, export dei dati, cancellazione anche di foto e video della chat;
  - promemoria dopo 24 mesi di archiviazione;
  - in `docs/PRIVACY.md` modelli per collaboratori, registro dei trattamenti e procedura in caso di violazione.
- **Metodo**:
  - letta una decina di tue programmazioni su Drive (senza aprire "01 GESTIONE" e "02 EX Clienti");
  - metodo scritto in `docs/METODO-BOZZA.md` dalle programmazioni e dalle tue risposte;
  - nell'editor la regola **doppia progressione** (4x7 16kg → 4x8 → 4x9 → 4x7 18,5kg).
- **Guida per Diego** passo per passo, con il messaggio da incollare in Claude (documento condiviso a parte).
- **Dalle risposte sul metodo**:
  - progetto annuale del cliente (fasi e stimoli mese per mese, timeline per il cliente, letto dall'AI);
  - fasi da 4 o 6 settimane secondo il piano;
  - prossimo allenamento in sequenza con la possibilità di sceglierne un altro;
  - dolori e fastidi segnalati al trainer;
  - l'AI fa da 1 a 5 domande prima della bozza e non propone mai scarichi o programmi estivi;
  - tempo per seduta;
  - EMOM spiegato al cliente;
  - metodo aggiornato in `docs/METODO-BOZZA.md`.
- **Ultime due richieste**:
  - bozze di risposta dell'AI ai clienti, in chat e nelle richieste del check-up: scritte nel tuo stile, una sola risposta per punti se le domande sono più di una, "Usa e modifica" o "Scrivo da zero"; imparano dai tuoi messaggi e dalle tue correzioni, distinguendo le abitudini che hai con tutti dal tono con il singolo cliente (confidenza, soprannomi); non partono mai da sole;
  - previsione degli incassi a 3, 6 o 12 mesi (Pagamenti → Previsione dei prossimi mesi), con scenario prudente calcolato sui rinnovi veri.

## Come l'ho provata
- 51 test sui calcoli (anche progressioni, costanza, record, numeri WhatsApp) (pliche verificate sui valori del foglio di una cliente, prescrizioni, pagamenti, calendario, import).
- 14 test sui permessi direttamente sul database (anche la chat: nessuno legge o scrive conversazioni non sue) (collaboratore vede solo i suoi, cliente non vede note PT/note fase/bozze, nessuno può cambiarsi ruolo, ecc.).
- 12 scenari end-to-end nel browser, ognuno provato sia da computer sia da telefono (clienti, check, posturale, sessioni, pagamenti, programmi, AI, import, eserciziario, chat con foto e video, permessi del collaboratore, logbook) + prove manuali automatizzate: logbook, check-up con avviso, pagamento, nota PT, risposta, invito collaboratore e cliente con le email in italiano, password dimenticata, controlli giornalieri, nessuno scorrimento orizzontale a 390 px.
- Assistente AI provato con un finto server Anthropic (tutto il percorso: contesto, risposta, bozza, registro costi). **Non l'ho provato con una chiave vera**: è la prima cosa da fare appena c'è la chiave (Impostazioni deve mostrare "Assistente AI attivo", poi una richiesta su un programma di prova).
- Dati usati nelle prove: solo persone inventate (`scripts/seed-demo.ts`).

## Decisioni aperte (tue o di Diego)
1. **Piano Supabase**: Free (niente backup, pausa dopo una settimana di inattività) o Pro (~25 $/mese). Con dati sanitari dei clienti consiglio Pro.
2. **Vercel Pro** è necessario per uso commerciale (~20 $/mese). In alternativa esistono altri hosting, ma la guida è scritta per Vercel.
3. **Come passare il codice a Diego**: la guida prevede che lui crei il repository vuoto e ti aggiunga come collaboratore, tu fai il push. Così il codice è suo e tu puoi mandargli aggiornamenti. Per la tua installazione: stesso procedimento con un repository tuo (anche questo stesso).
4. **Modello AI**: predefinito `claude-sonnet-5-5` (buon rapporto qualità/costo). Si cambia con la variabile `ANTHROPIC_MODEL` senza toccare il codice.
5. **Metodo**: `docs/METODO-BOZZA.md` ora è il tuo metodo (programmazioni + risposte). Va incollato in Impostazioni della tua installazione; Diego scrive il suo partendo da questa struttura. È la cosa che più migliora le bozze dell'AI.
6. **Privacy**: informativa, consenso e modelli pronti (`docs/PRIVACY.md`); prima dei clienti veri vanno firmati i DPA dei fornitori e fatta rileggere l'informativa a un legale.

## Domande della seconda passata (risposte di Davide)
1. Scadenza dei pacchetti: la decide il titolare a mano → fatto.
2. Il titolare vede le chat dei collaboratori: sì.
3. WhatsApp senza invio automatico: va bene.
4. Ricevute e fatture: non le fa l'app.

## Limiti noti di questa versione
- Le schede Google si importano una fase alla volta come CSV (File → Scarica → CSV). L'import riconosce la struttura delle schede attuali; formati molto diversi potrebbero richiedere ritocchi.
- Niente app nativa: è un sito che si aggiunge alla schermata Home del telefono. Niente notifiche push sul telefono (solo in app ed email); la chat si aggiorna ogni pochi secondi mentre è aperta.
- Video in chat fino a 50 MB con Supabase gratuito (si alza col piano Pro).
- Le date nei campi data seguono la lingua del browser (su un telefono in italiano sono gg/mm/aaaa).
