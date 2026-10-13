# Otherise

App web per personal trainer: clienti, programmi di allenamento, check corporei, sessioni PT, valutazione posturale, pagamenti (coaching e lezioni PT) e diario settimanale, con un assistente AI che prepara le bozze dei programmi seguendo il tuo metodo. Funziona da computer e da telefono.

**Per chi allena**
- Pagina "Oggi" con solo le cose da fare: diari con problemi, programmi in scadenza o da pubblicare, pagamenti, check da fare.
- Scheda cliente: panoramica, programma, sessioni PT (note anche dettate), check con pliche e calcolo automatico di massa grassa e magra (Jackson-Pollock 7 pliche uomo, 5 donna), grafici, posturale, pagamenti, diario.
- Editor dei programmi a griglia settimane × esercizi, blocchi (superserie, circuiti, AMRAP, EMOM, intervalli), copia settimana, nuova fase che riparte dal logbook reale, modelli, import dai fogli Google, eserciziario con video.
- Assistente AI (Claude): prepara o modifica la bozza da una richiesta scritta o dettata, propone progressioni e alternative; conosce metodo, esempi, eserciziario e storico del cliente.
- Bozze di risposta ai clienti nello stile del trainer (chat e diario), da usare, correggere o scartare.
- Previsione degli incassi dei prossimi mesi dai clienti attivi.
- Ruoli: titolare (vede tutto) e collaboratori (solo i clienti assegnati, niente pagamenti).
- Pagamenti fuori dall'app: "Pagato" in un tocco, promemoria WhatsApp già scritti, scadenze e pacchetti automatici, incassi per mese, export per il commercialista.
- Chat con i clienti (testo, foto e video), costanza degli allenamenti, record, progressioni automatiche (anche doppia progressione), prescrizioni in % del massimale, riassunto AI dei diari, email solo quando servono.
- Privacy GDPR: informativa con i dati del titolare, consenso esplicito al primo accesso (o modulo cartaceo), uso dell'AI dichiarato nell'informativa e compreso nel consenso, export e cancellazione dei dati, promemoria di cancellazione dopo 24 mesi.

**Per il cliente**
- Prossimo allenamento, avanzamento della fase, stato del percorso.
- Programma completo settimana per settimana con i video.
- Logbook dal telefono: valori già proposti, "ultima volta", nuovi record, timer di recupero, schermo sempre acceso, salvataggio automatico.
- Chat con il coach, anche con foto e video.
- Progressi: composizione corporea, circonferenze, test, posturale.
- Diario settimanale da 3 minuti; avviso gentile quando c'è un rinnovo o qualche sessione PT da sistemare.

## Documenti
- [Guida all'installazione](docs/GUIDA-INSTALLAZIONE.md) — portare l'app online sui propri account
- [Come si usa](docs/GUIDA-USO.md)
- [Come lavorare con Claude](docs/COME-LAVORARE-CON-CLAUDE.md)
- [Bozza del metodo per l'assistente AI](docs/METODO-BOZZA.md)
- [Privacy: cosa fa l'app, modelli e cose da fare](docs/PRIVACY.md)
- [Riepilogo della prima versione e decisioni aperte](docs/RIEPILOGO-PER-DAVIDE.md)
- [CLAUDE.md](CLAUDE.md) — note tecniche per chi modifica il codice (persone o Claude)

## Sviluppo
```bash
npm install
cp .env.example .env.local   # e compila le variabili
npm run dev
```
Controlli: `npm run typecheck && npm run lint && npm test && npm run build`. Dettagli in [CLAUDE.md](CLAUDE.md).
