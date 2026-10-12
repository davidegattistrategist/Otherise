# Come si usa Otherise (per chi allena)

Una pagina per le cose di tutti i giorni. L'app funziona da computer e da telefono: sul telefono, dal browser, "Aggiungi a schermata Home" e si apre come un'app.

## Chi vede cosa
- **Titolare**: vede tutto, compresi pagamenti, collaboratori e impostazioni.
- **Collaboratore**: vede solo i clienti che gli assegni (scheda del cliente → "Collaboratore"). Non vede pagamenti né impostazioni.
- **Cliente**: vede solo sé stesso, solo i programmi pubblicati, e i check/valutazioni posturali che rendi visibili. Le note delle sessioni PT e le "note per la prossima fase" non le vede mai.

## La pagina "Oggi"
Le cose da fare: check-up con qualcosa che non va, programmi che finiscono o da pubblicare, pagamenti in scadenza (con i pulsanti **Pagato** e **Promemoria**, solo titolare), clienti che non registrano allenamenti da una settimana o con costanza sotto il 50%, clienti senza check da più di 5 settimane.

Ogni mattina alle 8 arriva **una sola email di riepilogo** con pagamenti, programmi da preparare e clienti da sentire. Check-up con problemi e messaggi in chat arrivano invece subito.

Dal telefono il menu è in basso: Oggi, Clienti, Messaggi, Pagamenti e "Altro" per il resto.

## Un nuovo cliente
1. **Clienti → Nuovo cliente**: basta il nome. Sesso (serve per le pliche) e durata delle fasi si possono lasciare "Da decidere": comodo per chi fa solo lezioni PT o per un cliente spot di cui registri solo un pagamento. Il sesso te lo chiede l'app al primo check. Poi data di nascita, email, obiettivi. Spunta "Check-up settimanale" se vuoi che lo compili, e "Invia subito l'invito".
2. **Check → Nuovo check**: peso, pliche (fino a 3 misure per sito, l'app fa la media), circonferenze, test. Massa grassa e magra si calcolano mentre scrivi. Se manca una plica del protocollo la percentuale non viene calcolata (meglio nessun numero che un numero sbagliato).
   **Foto del check**: appena salvi il check compare **"Aggiungi le foto del check"**: un tocco, scegli dalla galleria tutte le foto insieme (frontale, laterali, dietro) e si caricano da sole. Il telefono le rimpicciolisce un poco (restano nitide, 2560 pixel di lato) e toglie i dati nascosti che le appesantiscono (posizione GPS, modello del telefono). Si vedono solo aprendo il check (nell'elenco dei check c'è solo quante sono): lì le aggiungi ("Aggiungi altre foto"), le apri a tutto schermo, le scarichi o le elimini. Il cliente in **Progressi → Le foto dei check** vede l'elenco delle date e apre le foto di un check con un tocco (solo dei check visibili al cliente).
   - Uomo: 7 pliche (tricipitale, pettorale, ascellare, sottoscapolare, soprailiaca, addominale, coscia). Donna: 5 (senza pettorale e ascellare).
3. **Posturale**: testo libero, con la spunta "Visibile al cliente" se vuoi che lo legga.
4. **Programma**: vedi sotto.
5. **Pagamenti** (titolare): imposta il piano (mensile, 6 settimane, trimestrale, pacchetto di sessioni, sessione singola…).

Nell'elenco **Clienti** quelli in pausa stanno in una sezione a parte, **In pausa**, sotto gli attivi; gli ex clienti sono in "Ex clienti".

## Il progetto annuale
Scheda del cliente → **Progetto**: i prossimi 12 mesi, uno per colonna.
- **Fase** del mese: Start, Volumizzazione, Intensificazione, Transizione, Reset, Scarico, Libero/estivo, Gara, Pausa.
- **Stimoli** (Posturale, Forza massima, Forza resistente, Massa magra, Aerobico, Vo2Max, Alimentazione…): tocca la cella per cambiare il livello (assente, mantenimento, medio, alto; per l'alimentazione non trattata, deficit, normocalorica, surplus). Gli stimoli si rinominano, si tolgono e se ne aggiungono.
- **Note** del mese: gare, vacanze, obiettivi.
- Con **Visibile al cliente** il cliente lo vede come timeline nel suo Percorso. L'assistente AI lo legge sempre per preparare le bozze.

## Scrivere un programma
Dalla scheda del cliente → **Programma**:
- **Crea la nuova fase**: copia l'ultima fase (stessi giorni ed esercizi) e compila la settimana 1 con quello che il cliente ha fatto davvero nel logbook. È il modo più veloce.
- **Usa il modello**: parte da un modello salvato.
- **Programma vuoto**, oppure **Importa dal foglio Google** (file .csv della scheda).

La durata delle fasi (4 o 6 settimane) si imposta nella scheda del cliente, come il suo piano: la nuova fase la usa da sola.

Nell'editor:
- Ogni riga è un esercizio, ogni colonna una settimana. Scrivi le prescrizioni come sempre: `4x8 60kg`, `3x10/12`, `3x30"`, `5x400m`, oppure testo libero.
- Blocchi: esercizio singolo, superserie, circuito, AMRAP, EMOM, intervalli, testo libero (riscaldamento, note).
- **Copia la settimana** nelle successive e poi ritocca solo i numeri.
- **Progressione** (icona con la freccia che sale, su ogni riga e in fondo a ogni giorno): scrivi solo la settimana 1 e scegli la regola. Le altre settimane si compilano da sole, all'istante e senza AI. Regole: **doppia progressione** (+1 ripetizione per due settimane, poi +2,5 kg e si riparte: 4x7 16kg → 4x8 → 4x9 → 4x7 18,5kg), +1 ripetizione, +2,5 kg, +5 kg, +2,5% del massimale, +1 serie, uguale; con l'eventuale ultima settimana di scarico.
- **Percentuali del massimale**: scrivi `5x5 @75%` e al cliente compare il carico in kg calcolato sul suo massimale (dal test di forza dell'ultimo check, altrimenti stimato dal logbook).
- **Dal telefono** l'editor mostra una settimana alla volta (S1, S2…) con esercizio, prescrizione e recupero: comodo per ritoccare un programma in palestra.
- Sotto ogni esercizio vedi cosa ha fatto il cliente l'ultima volta.
- **Tempo per seduta** (in alto, facoltativo): i minuti che il cliente ha a disposizione. Il cliente lo vede e l'AI ci sta dentro.
- **Recupero "EMOM 2"**: la serie riparte ogni 2 minuti (1,5 = 90 secondi). Il cliente lo vede spiegato così.
- **Ctrl/Cmd + S** salva. Il cliente non vede niente finché non premi **Pubblica**; quando pubblichi gli arriva una notifica.
- **Salva come modello** per riusarlo con altri clienti.

### L'assistente AI
- **"Chiedi all'AI di preparare o modificare la bozza"**: scrivi o detta (pulsante "Detta") cosa vuoi, anche in modo sbrigativo: *"fase di intensificazione, 3 giorni, togli gli affondi per il ginocchio, più lavoro di core"*. Puoi allegare una foto (es. i risultati dei test). L'AI conosce il tuo metodo (Impostazioni), i programmi che hai segnato come esempio, l'eserciziario e lo storico del cliente (programmi, logbook, check, posturale, check-up, note di sessione). Prepara una bozza: le righe cambiate sono evidenziate con il motivo. Tu controlli e pubblichi.
- Sopra la casella ci sono le **richieste rapide** (es. "Stessa struttura, progressione secondo il mio metodo", "Ultima settimana di scarico"): un tocco le aggiunge, poi completi a voce.
- Sulla singola riga: **Progredisci** (propone la progressione delle settimane) e **Alternative** (esercizi sostitutivi).
- **L'AI impara dalle tue correzioni.** Ogni bozza dell'AI viene conservata: quando pubblichi (o ritocchi un programma già pubblicato) l'app vede cosa hai cambiato riga per riga e ne ricava delle **lezioni** generali, che l'AI legge a ogni bozza insieme alle tue ultime correzioni. Le correzioni legate al singolo cliente (un fastidio, un attrezzo che manca) non diventano lezioni. In **Impostazioni → Cosa ha imparato dalle tue correzioni** trovi le lezioni (puoi correggerle o cancellarle) e la percentuale di righe che hai corretto nelle ultime bozze: l'obiettivo è che scenda verso zero.
- Nell'editor, la spunta **"Usa come esempio del mio stile per l'AI"** sui programmi che ti rappresentano meglio: l'AI li usa come riferimento.
- Prima della bozza l'AI fa domande **solo se ha un dubbio forte** (al massimo 5, spesso nessuna), con le risposte pronte da toccare. Puoi anche saltarle. Se il cliente non ha ancora un **tempo per seduta**, la prima domanda è sempre quella: la risposta diventa il tempo di riferimento del cliente. Se nella richiesta scrivi che il tempo è cambiato ("ora ha 45 minuti"), si aggiorna da solo.
- **Indicazioni per l'AI** (scheda cliente → Programma): tempo per seduta, livello di forza e di corsa, spinte verticali sì/poche/no, gambe accosciata↔hinge (cursore oppure "Segui il programma"), tecniche di intensità, note libere. Sopra vedi com'è fatto l'ultimo programma: serie a settimana per gruppo, % di accosciata e durata stimata di ogni giornata. Non sono regole fisse: l'AI segue sempre il programma più recente che hai scritto tu, e quando pubblichi un programma che va in un'altra direzione tempo, gambe e spinte verticali si aggiornano da sole (compare una riga che lo dice).
- Nell'editor, accanto al nome di ogni giornata c'è la **durata stimata** (cambi esercizio, avvicinamento sui fondamentali e recuperi compresi): diventa arancione se supera il tempo per seduta.
- L'AI mantiene la tua struttura: stessi rapporti tra gruppi muscolari, al massimo ±4 serie a settimana per gruppo, fondamentali e varianti come li hai messi tu, varietà soprattutto sui muscoli piccoli. Non corregge e non commenta le tue scelte.
- L'AI non propone mai di sua iniziativa scarichi, programmi estivi, reset o test, e non cambia il programma per un dolore: lo segnala e decidi tu. Non pubblica mai: rivedi sempre tu.
- Il nome del cliente non viene mai mandato all'AI. La spesa del mese e il tetto sono in Impostazioni.

## Durante e dopo le sessioni
- **Nota sessione PT** (in alto nella scheda): due righe a fine allenamento, anche dettate con **"Detta"**: un tocco per iniziare a parlare, uno per finire (si vede il tempo che passa), poi in pochi secondi il testo compare nella casella. Funziona uguale su iPhone, Android e computer, e c'è anche nelle note del check, nelle indicazioni per l'AI, nella risposta al check-up e, per il cliente, nel check-up e nel logbook. Le sessioni "che contano nel pacchetto" scalano le sessioni rimaste di chi ha un pacchetto.
- **Registra l'allenamento** (nella panoramica del cliente): compili tu il logbook al posto del cliente, per esempio durante la sessione in palestra.
- Il cliente ha sempre il **prossimo allenamento**, mai un giorno fisso: li fa in ordine e, se ne salta uno, riparte da quello. Se un giorno non può (niente palestra) può sceglierne un altro e recuperare dopo.
- **Dolori e fastidi**: nel logbook il cliente può scrivere "Hai sentito dolore o fastidio?". Ti arriva subito una notifica (ed email) e compare in **Oggi → Dolori e fastidi** finché non premi "Visto". Anche un check-up con "Dolori, fastidi o imprevisti" compilato ti avvisa.
- Il cliente registra il logbook dal telefono: i campi sono già proposti con i carichi del programma o dell'ultima volta; la spunta conferma la serie e fa partire il timer di recupero (±15 secondi, pausa e ripresa). Sui blocchi AMRAP, EMOM e intervalli c'è **"Avvia il timer"**: 3 secondi per prepararsi, poi il conto dei giri (es. "Giro 3/12", "Lavoro 2/8"), con bip e vibrazione a ogni cambio (su iPhone niente vibrazione, Apple non la permette alle app web: la barra lampeggia; con il telefono in silenzioso i bip non si sentono); si mette in pausa, si ricomincia o si ferma, e il suono si può togliere. Gli esercizi con recupero "EMOM 2" hanno "Avvia l'EMOM"; le serie a tempo (es. plank 30") si avviano con un tocco e si spuntano da sole alla fine. Lo schermo resta acceso. Se batte un record (massimale stimato o carico più alto) compare **"Nuovo record!"**. Si salva da solo anche se salta la connessione.
- Nella panoramica del cliente vedi l'**andamento degli esercizi** (massimale stimato nel tempo) e gli **allenamenti per settimana**; il cliente vede gli stessi grafici e i suoi record nei Progressi.

## Chat
- **Messaggi** nel menu: una conversazione per cliente, con testo, foto, video e **vocali**: con la casella vuota il tasto in basso a destra è il microfono (un tocco per registrare, la freccia per mandare, la X per annullare; massimo 5 minuti). Sotto ogni vocale c'è **Visualizza trascrizione** per leggerlo invece di ascoltarlo, e la bozza di risposta dell'AI parte dalla trascrizione. Il cliente la trova in "Chat" nell'app.
- **I video si riducono da soli prima dell'invio**, come su WhatsApp (sulla miniatura compare "Riduco… 40%"): il telefono lo fa scorrere più veloce del normale e ne tiene una copia più piccola, 480p, un minuto pesa circa 5 MB invece di 60–100 e si apre su ogni telefono. Sotto il video compare quanto è stato ridotto e in quanti secondi. Sotto ogni foto e video c'è **Scarica** (sul telefono si apre "Condividi": scegli "Salva video" o "Salva immagine" e finisce nelle Foto). Il video comincia a salire subito, mentre scrivi il messaggio: tieni aperta l'app finché non è inviato (se la chiudi, il messaggio non parte e lo rimandi). **Dopo 6 mesi i video si cancellano da soli** per non riempire lo spazio: il messaggio resta con "Video scaduto". Se un video ti serve per sempre, salvalo sul telefono.
- **Da rispondere** (in Messaggi) mostra le chat con messaggi che non hai ancora visto: appena apri una chat esce dall'elenco, anche se non rispondi. Se vuoi ricordarti di rispondere più tardi, nella chat premi **"Segna da leggere"** (in alto a destra): torna tra quelle da rispondere.
- Il titolare vede tutte le conversazioni, il collaboratore quelle dei suoi clienti. I messaggi si aggiornano da soli mentre la chat è aperta; chi riceve un messaggio ha una notifica (al massimo una all'ora per conversazione) e un'email. Con le notifiche push attive, sul telefono arriva un avviso per ogni messaggio, anche ad app chiusa.

## Avvisi per email

- **Le email sono il meno possibile.** Niente riepilogo del mattino: il riepilogo è **Oggi** nell'app.
  - Chi **non** ha attivato le notifiche sul telefono: riceve le novità non ancora lette, al massimo **una email al giorno** con tutto insieme, e ogni email consiglia di attivare le notifiche.
  - Chi **ha** le notifiche sul telefono: niente email, tranne due casi: un tuo messaggio in chat o il programma nuovo **non ancora visti dopo 3 giorni**.
- **Impostazioni → Avvisi per email**: chi le può ricevere. Di serie tu e i collaboratori no, i clienti sì (con le regole sopra). Le email per entrare (invito e nuova password) partono sempre.
- **Finestra "Attiva le notifiche"**: quando il cliente (o tu) apre l'app dalla schermata Home la prima volta, compare una finestra che spiega perché attivarle (messaggi, programmi, promemoria). "Più tardi" la ripropone dopo 3 giorni. Con le notifiche attive non arrivano più email.

## Notifiche e app sul telefono

- **Senza ricaricare**: campanella, numero dei messaggi e un avviso in alto si aggiornano da soli mentre l'app è aperta (controllo ogni 20 secondi e appena torni sull'app).
- **App sulla Home**: al primo accesso dal telefono l'app chiede "iPhone o Android?" e mostra i passi per aggiungerla alla schermata Home (su Android spesso basta il pulsante **Installa**). Se qualcuno la salta, la guida ricompare dopo tre giorni; si riapre anche da **Notifiche → Metti l'app sulla Home**.
- **Notifiche push**: in **Oggi** compare "Attiva le notifiche"; lo stato si vede e si cambia in **Notifiche → Notifiche su questo dispositivo** (con "Manda una prova"). Su iPhone funzionano solo con l'app aperta dall'icona sulla Home (iOS 16.4 o successivo). Le chiavi per le push si creano da sole: non c'è niente da configurare.
- **Bozza di risposta**: quando un cliente ti fa una domanda, l'assistente AI ti prepara una bozza sopra la casella di scrittura, scritta come la scriveresti tu. Se le domande sono più di una, è un solo messaggio che risponde a tutte per punti. **Usa e modifica** la mette nella casella (la correggi e premi invio), **Scrivo da zero** la toglie. Se il cliente non ha fatto domande puoi chiederla tu con "Prepara una bozza di risposta". Non parte mai niente da sola: invii sempre tu. La bozza confronta l'ultimo allenamento con il programma serie per serie e, quando carichi e ripetizioni sono scritti nel programma, non suggerisce di cambiarli. Quando correggi o riscrivi una bozza, l'AI capisce cosa hai cambiato e se lo ricorda: le abitudini che valgono con tutti le trovi in Impostazioni → Cosa ha imparato dalle tue risposte, quelle sul singolo cliente nella sua scheda (Programma → Indicazioni per l'AI → Come scrivergli in chat). Puoi correggerle o cancellarle.
- Le bozze imparano da te, su due livelli: le **abitudini che hai con tutti** (lunghezza, saluti, modi di dire che si ripetono con clienti diversi) e il **tono che usi con quel cliente** (più confidenziale o più professionale, un soprannome al posto del nome, il lei). Il tono del singolo cliente vince, e confidenze o soprannomi di un cliente non finiscono mai nelle risposte a un altro. L'assistente legge i tuoi messaggi veri e come hai corretto o sostituito le bozze precedenti: più lo usi più ti somiglia. Ogni trainer ha il suo stile: le bozze per i clienti di un collaboratore imparano dai messaggi del collaboratore. All'AI non arrivano nome, cognome, email e telefono del cliente, né foto e video.
- Tocca un tuo messaggio per eliminarlo. WhatsApp resta comodo per le cose al volo: la chat dell'app tiene tutto ordinato dentro la scheda del cliente, per esempio il video di un esercizio da correggere.

## Il check-up settimanale
Il cliente lo compila da venerdì a domenica (allenamenti, sonno, stress, percorso, da 1 a 5, più problemi e richieste). **Ricevi un avviso solo se qualcosa non va**: un voto 1–2, un calo di 2 punti rispetto alla settimana prima, oppure una richiesta scritta. Rispondi dalla scheda del cliente → **Check-up**: la risposta la vede nell'app.

**Prepara il riassunto** (nella stessa pagina): l'AI legge check-up, logbook, check e note di sessione e ti dice cosa funziona, cosa sta calando e su cosa puntare, con una bozza di risposta che puoi usare con un tocco e correggere.

Se nel check-up il cliente ha scritto una **richiesta**, trovi già pronta una bozza di risposta sopra la casella (stesse regole della chat: Usa e modifica, oppure Scrivo da zero).

## Pagamenti (titolare)
- **Nuovo pagamento** (in alto in Pagamenti, o dalla scheda pagamenti del cliente): scegli chi paga (o crea al volo un cliente nuovo, basta il nome) e cosa paga: **Rinnovo** del suo piano (importo e periodo già proposti dal giorno dopo l'ultimo saldato), **Abbonamento** nuovo (mensile, trimestrale…, la fine si calcola da sola), **Lezioni PT** (quante e quanto: con il prezzo a lezione l'importo si calcola da solo; si scalano quando segni le sessioni) o **Altro** (valutazione posturale, consulenza…). In fondo una frase riassume cosa verrà registrato: controlli e salvi. Se il cliente era in pausa puoi riattivarlo nello stesso momento.
- **Tutti i pagamenti** (in fondo a Pagamenti, si apre con un tocco): ogni pagamento registrato, dal più recente, diviso per mese con il totale.
- **Correggere un pagamento**: nello storico dei pagamenti ogni riga ha **Modifica**: data d'incasso, importo, metodo, periodo coperto (es. il trimestre parte il 1° settembre e non il 1° agosto) o sessioni, note.
I pagamenti avvengono fuori dall'app. Qui registri cosa è saldato, nel modo più veloce possibile:
- **Pagato**: in "Oggi" e in "Pagamenti", un tocco registra il pagamento atteso (importo del piano e periodo successivo, o le sessioni del pacchetto). Prima ti chiede conferma mostrandoti cosa registra.
- **Promemoria**: apre la chat dell'app con il cliente, con il promemoria già scritto (lo controlli e premi invio). Il testo si cambia in Impostazioni.
- Scheda cliente → **Pagamenti → Registra un pagamento** per i casi particolari (importo diverso, pagamento a metà…).
- **Pagamenti** nel menu: chi è scaduto e chi scade a breve, incassi per mese (grafico dell'ultimo anno), quanto entra nei prossimi 30 giorni, ricorrente stimato.
- **Previsione dei prossimi mesi** (in fondo a Pagamenti): quanto dovrebbe entrare nei prossimi 3, 6 o 12 mesi dai clienti attivi. Gli abbonamenti si rinnovano alla scadenza allo stesso prezzo; i pacchetti quando finiscono le sessioni, al ritmo con cui le fa ogni cliente. Clienti in pausa e archiviati sono esclusi. Lo **scenario prudente** tiene conto di quanti clienti hanno rinnovato davvero nell'ultimo anno. È una stima: i pagamenti veri li registri sempre tu.
- **Esporta per il commercialista**: un file con tutti i pagamenti dell'anno (data, cliente, importo, metodo, periodo) che si apre con Excel.
- L'app avvisa te e il cliente prima della scadenza (giorni di preavviso in Impostazioni). I pacchetti di sessioni si scalano da soli con le sessioni PT.
- **Sessioni PT, un solo contatore** (scheda Pagamenti del cliente → **Sessioni PT**): *rimaste = pagate − fatte*. Contano tutte le sessioni pagate (pacchetti, lezioni a parte, saldi) e tutte le sessioni PT segnate "si scala". Se fa sessioni senza averle pagate, il contatore va sotto zero ("N da saldare", con l'importo se hai messo il prezzo a sessione); quando compra un pacchetto quelle si scalano da sole e il resto diventa "rimaste". Per partire o sistemare il numero (per esempio sessioni fatte prima dell'app): **Correggi il conteggio** → "Oggi gliene restano N" oppure "ne deve saldare N", da lì va da solo. Chi ha un abbonamento con le sessioni comprese non ha contatore. Le sessioni pagate si registrano con **Registra un pacchetto o lezioni pagate**.
- **Pacchetto terminato**: se un pacchetto finisce secondo i vostri accordi anche con sessioni non usate, nella scheda Pagamenti premi "Segna il pacchetto come terminato" (si può annullare). Il cliente risulta da rinnovare.

## Privacy
- Al primo accesso il cliente legge l'informativa e dà il consenso sui dati di salute: senza consenso non entra nella sua area. Chi inizia di persona prima di avere l'app firma il **modulo da stampare** (scheda → Scheda → Privacy) e tu premi "Firmato su carta".
- L'uso dell'assistente AI è scritto nell'informativa e compreso nel consenso iniziale: non c'è un interruttore per il cliente.
- **Permesso per Instagram**: è facoltativo. Se un cliente accetta l'informativa senza darlo, a te e al collaboratore che lo segue arriva un avviso, così potete parlargliene; lui lo può dare quando vuole dall'app (Percorso → Privacy → Video sui social) e ti arriva un avviso anche allora.
- Richieste di copia o cancellazione dei dati ti arrivano come notifica: "Scarica tutti i suoi dati" ed "Elimina per sempre" sono nella scheda del cliente. Rispondi entro un mese.
- Un ex cliente che ha finito il percorso da 5 anni: l'app ti ricorda di cancellarne i dati sulla salute. Tutto il resto è in `docs/PRIVACY.md`.

## Eserciziario
Nome, link al video YouTube, indicazioni. Quando scrivi un programma i nomi si completano da soli e il cliente vede il video. Se in un programma usi un esercizio che non c'è, l'editor ti propone di aggiungerlo.
