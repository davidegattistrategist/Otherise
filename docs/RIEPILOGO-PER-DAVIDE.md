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

## Come l'ho provata
- 45 test sui calcoli (pliche verificate sui valori del foglio di una cliente, prescrizioni, pagamenti, calendario, import).
- 13 test sui permessi direttamente sul database (collaboratore vede solo i suoi, cliente non vede note PT/note fase/bozze, nessuno può cambiarsi ruolo, ecc.).
- 3 test end-to-end nel browser + prove manuali automatizzate: logbook, check-up con avviso, pagamento, nota PT, risposta, invito collaboratore e cliente con le email in italiano, password dimenticata, controlli giornalieri, nessuno scorrimento orizzontale a 390 px.
- Assistente AI provato con un finto server Anthropic (tutto il percorso: contesto, risposta, bozza, registro costi). **Non l'ho provato con una chiave vera**: è la prima cosa da fare appena c'è la chiave (Impostazioni deve mostrare "Assistente AI attivo", poi una richiesta su un programma di prova).
- Dati usati nelle prove: solo persone inventate (`scripts/seed-demo.ts`).

## Decisioni aperte (tue o di Diego)
1. **Piano Supabase**: Free (niente backup, pausa dopo una settimana di inattività) o Pro (~25 $/mese). Con dati sanitari dei clienti consiglio Pro.
2. **Vercel Pro** è necessario per uso commerciale (~20 $/mese). In alternativa esistono altri hosting, ma la guida è scritta per Vercel.
3. **Come passare il codice a Diego**: la guida prevede che lui crei il repository vuoto e ti aggiunga come collaboratore, tu fai il push. Così il codice è suo e tu puoi mandargli aggiornamenti. Per la tua installazione: stesso procedimento con un repository tuo (anche questo stesso).
4. **Modello AI**: predefinito `claude-sonnet-5-5` (buon rapporto qualità/costo). Si cambia con la variabile `ANTHROPIC_MODEL` senza toccare il codice.
5. **Metodo**: `docs/METODO-BOZZA.md` è solo una traccia con domande aperte; va riscritto da Diego (e da te per la tua installazione). È la cosa che più migliora le bozze dell'AI.
6. **Privacy**: informativa e consenso per i dati sanitari restano da preparare (`docs/PRIVACY.md`).

## Limiti noti di questa versione
- Le schede Google si importano una fase alla volta come CSV (File → Scarica → CSV). L'import riconosce la struttura delle schede attuali; formati molto diversi potrebbero richiedere ritocchi.
- Il logbook lo compila il cliente: lo staff lo vede e lo usa, ma non c'è ancora una schermata per compilarlo al posto del cliente durante la sessione.
- Niente app nativa: è un sito che si aggiunge alla schermata Home del telefono. Niente notifiche push sul telefono (solo in app ed email).
- Le date nei campi data seguono la lingua del browser (su un telefono in italiano sono gg/mm/aaaa).
