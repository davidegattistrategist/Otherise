# Privacy: cosa fa l'app e cosa devi fare tu

Questo file mette insieme tutto quello che serve sulla privacy (GDPR) per usare Otherise con clienti veri. Prima di partire fallo rileggere a un consulente o a un legale: i testi sono pensati per essere definitivi, ma quel controllo resta comunque necessario.

## In breve: cosa fare prima del primo cliente vero
1. **Impostazioni → Privacy**: scrivi titolare (il tuo nome o la ragione sociale), indirizzo, codice fiscale o partita IVA e un'email per la privacy. Questi dati finiscono da soli nell'informativa.
2. Leggi l'informativa che vedranno i clienti: `https://<il-tuo-indirizzo>/privacy`.
3. **Accetta i contratti dei fornitori** (DPA, vedi sotto) e salva i PDF in una cartella "Privacy".
4. Se lavori con **collaboratori**, fai firmare a ognuno la lettera di autorizzazione (modello sotto).
5. Compila il **registro dei trattamenti** (modello sotto) e tienilo nella stessa cartella.
6. Passa a **Supabase Pro**, che fa i backup automatici, prima di mettere dati veri.

## Cosa fa già l'app
- **Informativa pubblica** su `/privacy`, con i tuoi dati presi dalle Impostazioni.
- **Consenso al primo accesso.** Il cliente non entra nella sua area finché non:
  - conferma di aver letto l'informativa;
  - dà il consenso esplicito sui dati relativi alla salute (art. 9 GDPR).

  La data del consenso resta registrata. Se in futuro cambi l'informativa in modo importante, l'app gliela ripropone (chi sviluppa aggiorna `PRIVACY_VERSION` in `src/lib/privacy.ts`).
- **Consenso su carta** per chi inizia di persona, prima di avere l'app:
  - nella scheda del cliente → Scheda → Privacy → "Modulo da stampare" (oppure `/privacy/modulo`);
  - lo fai firmare, lo conservi e premi "Firmato su carta".
- **Assistente AI compreso nel servizio.** L'informativa dice che il coach usa strumenti di intelligenza artificiale (punto 4) e su quale base: il contratto e, per i dati relativi alla salute, il consenso esplicito che il cliente dà al primo accesso (il testo del consenso cita gli strumenti di intelligenza artificiale). Il testo per il cliente resta generale (esperienza migliore e programmi di qualità più alta) senza descrivere passo per passo come viene usata. Non c'è un interruttore per il singolo cliente: chi non è d'accordo ne parla con il coach prima di confermare, e revocando il consenso smette di usare l'app. In ogni caso all'AI non arrivano mai nome, cognome, email o telefono. Per le bozze di risposta riceve anche il testo degli ultimi messaggi della chat (niente foto o video); le risposte le manda sempre il trainer.
- **Diritti del cliente.** Da Percorso → Privacy il cliente:
  - chiede una copia dei suoi dati;
  - chiede la cancellazione;
  - revoca il consenso.

  Le richieste ti arrivano come notifica (ed email). Di solito si ha **un mese** per rispondere.
- **Copia dei dati**: scheda del cliente → Scheda → "Scarica tutti i suoi dati" (solo titolare). Scarica un file con tutto quello che l'app conserva su quel cliente.
- **Cancellazione**: scheda del cliente → Scheda → "Elimina per sempre". Cancella dati, account, foto e video della chat.
- **Conservazione**: quando un cliente è archiviato da 24 mesi, l'app ti avvisa che è il momento di cancellarlo, come scritto nell'informativa.
- **Sicurezza**:
  - si entra solo su invito;
  - i permessi sono controllati dal database (il collaboratore vede solo i suoi clienti);
  - foto e video sono in un archivio privato con link temporanei;
  - database in UE (Francoforte).

## I fornitori (responsabili del trattamento) e i loro contratti
Per ognuno accetta o scarica il **DPA** (Data Processing Agreement, "accordo sul trattamento dei dati") e salvalo. Se un indirizzo è cambiato, cerca "DPA" sul sito del fornitore.

| Fornitore | A cosa serve | Dove sono i dati | Dove trovi il DPA |
|---|---|---|---|
| Supabase | database, accessi, foto e video della chat | UE (Francoforte) | supabase.com/legal/dpa (si firma online) |
| Vercel | pubblicazione dell'app | UE/USA | vercel.com/legal/dpa |
| Anthropic | assistente AI | USA | anthropic.com/legal (il DPA è incluso nei termini commerciali delle API) |
| Resend | invio delle email | USA/UE | resend.com/legal/dpa |

I trasferimenti verso gli USA sono coperti dalle clausole contrattuali standard contenute nei DPA o, per i fornitori aderenti, dall'EU-US Data Privacy Framework. Il testo dell'informativa li descrive già.

## Modello: lettera di autorizzazione per un collaboratore
> **Autorizzazione al trattamento dei dati personali (art. 29 GDPR e art. 2-quaterdecies d.lgs. 196/2003)**
>
> Io, [titolare], titolare del trattamento, autorizzo [nome e cognome del collaboratore] a trattare i dati personali, compresi quelli relativi alla salute, dei clienti che gli assegno, solo per seguirne il percorso di allenamento.
>
> Il collaboratore si impegna a:
> - usare i dati solo per questo scopo e solo attraverso l'app Otherise;
> - mantenere la riservatezza, anche dopo la fine della collaborazione;
> - non copiare dati fuori dall'app (niente screenshot, fogli o chat personali con dati di salute), salvo quanto strettamente necessario e da me autorizzato;
> - custodire la propria password, non condividerla e avvisarmi subito in caso di smarrimento o di accesso sospetto;
> - segnalarmi entro 24 ore qualsiasi possibile violazione dei dati (ad esempio un telefono perso con l'app aperta);
>
> L'autorizzazione termina con la fine della collaborazione: da quel momento l'accesso all'app viene revocato.
>
> Luogo e data ____________ Firma del titolare ____________ Firma del collaboratore ____________

## Modello: registro dei trattamenti (art. 30 GDPR)
Il registro è obbligatorio quando si trattano dati relativi alla salute in modo non occasionale.

| Voce | Contenuto |
|---|---|
| Titolare | [nome, indirizzo, CF/P.IVA, email] |
| Trattamento | Gestione dei percorsi di allenamento personalizzato tramite l'app Otherise |
| Finalità | Programmazione e monitoraggio degli allenamenti; valutazioni corporee e posturali; comunicazioni con il cliente; gestione amministrativa degli abbonamenti; sicurezza dell'app |
| Categorie di interessati | Clienti (anche potenziali); collaboratori |
| Categorie di dati | Anagrafici e di contatto; dati relativi alla salute (misure, pliche, composizione corporea, postura, test, dolori, sonno, stress, foto e video); dati di allenamento; messaggi; dati amministrativi (importi e date dei pagamenti); dati tecnici di accesso |
| Basi giuridiche | Contratto (art. 6.1.b); consenso esplicito per i dati relativi alla salute (art. 9.2.a); obbligo legale per i documenti fiscali (art. 6.1.c); legittimo interesse per la sicurezza (art. 6.1.f) |
| Destinatari | Collaboratori autorizzati; responsabili: Supabase, Vercel, Anthropic, Resend; commercialista (solo dati amministrativi) |
| Trasferimenti extra UE | USA (Vercel, Anthropic, Resend, Supabase Inc.), con clausole contrattuali standard o Data Privacy Framework |
| Conservazione | Durata del percorso + 24 mesi dall'archiviazione, poi cancellazione; documenti fiscali 10 anni (fuori dall'app) |
| Misure di sicurezza | Accesso solo su invito con password personale; permessi a livello di database; cifratura delle connessioni; archivio privato per i file; pseudonimizzazione verso l'AI; backup giornalieri (Supabase Pro); revoca immediata degli accessi dei collaboratori |

## Se succede qualcosa (violazione dei dati)
Esempi: un telefono perso con l'app aperta, una password finita in mano ad altri, dati mandati alla persona sbagliata.
1. **Subito**:
   - cambia la password interessata;
   - se è un collaboratore, togli l'accesso dalla pagina Collaboratori;
   - in casi gravi, su Supabase (Authentication → Users) cambia la password dell'utente coinvolto o eliminalo.
2. **Entro 72 ore**, se c'è un rischio per le persone (con dati di salute di solito c'è), fai la notifica al Garante dal sito garanteprivacy.it ("Notifica data breach").
3. Se il rischio è alto, avvisa anche i clienti coinvolti.
4. Annota sempre l'accaduto nel registro, anche se decidi di non notificarlo: cosa è successo, quali dati, cosa hai fatto.

## Altre buone abitudini
- Password lunghe e diverse per l'app, Supabase, Vercel, GitHub e Anthropic. Attiva la verifica in due passaggi dove c'è.
- Non mandare dati di salute dei clienti su WhatsApp: usa la chat dell'app.
- Quando un collaboratore smette: pagina Collaboratori → "Togli l'accesso".
- Minorenni: il modulo cartaceo prevede la firma del genitore. Nell'app conviene invitare un minorenne solo dopo aver raccolto quella firma.
