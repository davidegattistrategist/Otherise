# Privacy e dati dei clienti — note pratiche

Non è una consulenza legale: è un promemoria di cosa fa l'app e di cosa resta da fare a chi la usa. Per i documenti (informativa, consenso) fatti aiutare da un consulente o dalla tua associazione di categoria.

## Che dati tratta l'app
- Anagrafica e contatti dei clienti, obiettivi.
- **Dati relativi alla salute** (categoria particolare per il GDPR): pliche, peso, composizione corporea, circonferenze, valutazione posturale, dolori e fastidi scritti nel check-up o nelle note, sonno e stress.
- Allenamenti registrati, pagamenti (solo importi e date: nessun dato di carte o conti).

## Cosa fa l'app per proteggerli
- I dati stanno nel **tuo** progetto Supabase, nella regione di Francoforte (UE). Davide non ha accesso alla tua installazione.
- Ognuno vede solo quello che deve (controllato dal database, non solo dalle schermate): il collaboratore solo i suoi clienti, il cliente solo sé stesso.
- All'assistente AI non vengono mai mandati nome, cognome, email o telefono del cliente, solo dati di allenamento. Per impostazione predefinita Anthropic non usa i dati inviati via API per addestrare i modelli.
- Accesso solo su invito, con password.

## Cosa resta da fare a te
1. **Informativa e consenso**: i clienti devono sapere quali dati raccogli, perché, dove stanno e per quanto, e darti il consenso esplicito per i dati sulla salute. Puoi aggiungere all'informativa che usi servizi cloud (Supabase, Vercel, Anthropic, Resend) come responsabili del trattamento.
2. **Accordi con i fornitori (DPA)**: Supabase, Vercel, Anthropic e Resend offrono un Data Processing Agreement standard sui loro siti; scaricali e conservali.
3. **Backup**: con il piano Free di Supabase non ci sono backup automatici. Con dati veri passa al piano Pro.
4. **Cancellazione**: se un cliente chiede di cancellare i suoi dati, scheda cliente → Scheda → "Elimina per sempre" (cancella anche il suo account). Per chi smette e basta, usa lo stato "Archiviato".
5. **Account**: password robuste per te e i collaboratori; quando un collaboratore smette, "Togli l'accesso" nella pagina Collaboratori.
