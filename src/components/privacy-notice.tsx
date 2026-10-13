/**
 * Informativa privacy per i clienti (artt. 13 e 14 GDPR).
 * I dati del titolare arrivano da Impostazioni → Privacy.
 * Se cambi il testo in modo sostanziale aggiorna PRIVACY_VERSION in lib/privacy.ts.
 */
import type { ReactNode } from "react";
import { PRIVACY_VERSION, type PrivacyOwner } from "@/lib/privacy";
import { formatLong } from "@/lib/dates";

function Missing({ children }: { children: ReactNode }) {
  return <span className="rounded bg-accent-soft px-1">[{children}]</span>;
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-7 mb-2 text-lg font-semibold">{children}</h2>;
}

export function PrivacyNotice({ owner }: { owner: PrivacyOwner }) {
  const name = owner.legalName.trim() ? owner.legalName : <Missing>nome e cognome o ragione sociale del titolare</Missing>;
  const address = owner.legalAddress.trim() ? owner.legalAddress : <Missing>indirizzo</Missing>;
  const taxId = owner.legalTaxId.trim() ? owner.legalTaxId : <Missing>codice fiscale o partita IVA</Missing>;
  const email = owner.privacyEmail.trim() ? <a className="underline" href={`mailto:${owner.privacyEmail}`}>{owner.privacyEmail}</a> : <Missing>email per la privacy</Missing>;
  const brand = owner.businessName || "Otherise";
  const pec = owner.privacyPec?.trim() ? <> o alla PEC <a className="underline" href={`mailto:${owner.privacyPec}`}>{owner.privacyPec}</a></> : null;

  return (
    <div className="text-[15px] leading-relaxed text-ink-soft [&_li]:mt-1.5 [&_p]:mt-2 [&_strong]:text-ink [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <p>
        Questa informativa spiega come trattiamo i tuoi dati personali quando ti alleni con {brand} e usi l&apos;app. Te la diamo in base agli articoli 13 e 14 del Regolamento europeo 2016/679 (&quot;GDPR&quot;) e al Codice privacy italiano (d.lgs. 196/2003 e successive modifiche).
      </p>

      <H>1. Chi è il titolare del trattamento</H>
      <p>
        Il titolare è {name}, {address}, {taxId}. Per qualsiasi domanda sui tuoi dati, per esercitare i tuoi diritti o per revocare un consenso scrivi a {email}{pec}. Non abbiamo nominato un responsabile della protezione dei dati (DPO) perché per un&apos;attività delle nostre dimensioni non è obbligatorio.
      </p>

      <H>2. Quali dati trattiamo</H>
      <ul>
        <li><strong>Dati anagrafici e di contatto</strong>: nome, cognome, sesso, data di nascita, email, telefono.</li>
        <li><strong>Dati relativi alla salute</strong> (categoria particolare, art. 9 GDPR): peso, pliche, composizione corporea, circonferenze, valutazioni posturali, test di forza e di performance, dolori, fastidi o infortuni che ci segnali, qualità del sonno, stress e andamento del percorso.</li>
        <li><strong>Immagini</strong>: foto e video fatti durante gli allenamenti o che ci mandi in chat (per esempio per correggere la tecnica o vedere i progressi).</li>
        <li><strong>Dati di allenamento</strong>: obiettivi, programmi, allenamenti registrati (carichi, ripetizioni, tempi), sessioni con il coach, diari settimanali, messaggi della chat (anche vocali, con la loro trascrizione scritta).</li>
        <li><strong>Dati amministrativi</strong>: tipo di servizio (coaching o lezioni PT), importi e date dei pagamenti, dati per la fatturazione. Nell&apos;app non trattiamo mai dati di carte o conti: i pagamenti avvengono fuori.</li>
        <li><strong>Dati tecnici</strong>: account, data degli accessi e registri tecnici necessari a far funzionare l&apos;app in sicurezza.</li>
      </ul>
      <p>I dati li raccogliamo da te (durante i check, le sessioni e nell&apos;app) e dal tuo coach, che li registra durante il percorso.</p>

      <H>3. Perché li trattiamo e su quale base</H>
      <ul>
        <li><strong>Seguirti nel percorso di allenamento</strong>: preparare e aggiornare i programmi, leggere i tuoi allenamenti, fare check e sessioni, risponderti in chat e ai diari. Base: il contratto con te (art. 6.1.b GDPR).</li>
        <li><strong>Usare i dati relativi alla salute</strong> per valutare il tuo stato e programmare in modo sicuro ed efficace. Base: il tuo <strong>consenso esplicito</strong> (art. 9.2.a GDPR), che ti chiediamo nell&apos;app o su carta.</li>
        <li><strong>Fare foto e video durante gli allenamenti</strong>, solo per il servizio: correggere la tecnica, seguire i progressi, spiegarti un esercizio. Restano tra te e chi ti allena e non vengono pubblicati. Base: il contratto (art. 6.1.b) e il tuo consenso, che dai insieme a quello sui dati relativi alla salute.</li>
        <li><strong>Pubblicare su Instagram</strong> (e sugli altri social del brand) alcuni video e foto delle sedute di personal training fatte insieme, per promuovere l&apos;attività. Solo se ce lo permetti: è un consenso a parte e <strong>facoltativo</strong> (art. 6.1.a GDPR), vedi il punto 5.</li>
        <li><strong>Usare strumenti di intelligenza artificiale</strong> per offrirti un&apos;esperienza migliore e programmi di qualità più alta (punto 4). Base: il contratto (art. 6.1.b) e, per i dati relativi alla salute, il tuo consenso esplicito (art. 9.2.a).</li>
        <li><strong>Gestire coaching e lezioni</strong>: tenere il registro dei pagamenti e ricordarti le scadenze. Base: il contratto (art. 6.1.b). I documenti fiscali li gestiamo fuori dall&apos;app per obbligo di legge (art. 6.1.c).</li>
        <li><strong>Mandarti avvisi di servizio</strong> nell&apos;app e per email (nuovo programma, risposta al diario, messaggi, scadenze). Base: il contratto (art. 6.1.b).</li>
        <li><strong>Proporti per email servizi simili</strong> a quelli che hai già acquistato, usando l&apos;indirizzo che ci hai dato (art. 130, comma 4 del Codice privacy). Base: il nostro legittimo interesse. Puoi opporti in ogni momento, anche rispondendo all&apos;email, senza alcuna conseguenza.</li>
        <li><strong>Tenere la contabilità e adempiere agli obblighi fiscali</strong> (fatture, registri, controlli delle autorità). Base: obbligo di legge (art. 6.1.c).</li>
        <li><strong>Tenere l&apos;app sicura</strong> e prevenire accessi non autorizzati, e <strong>tutelare i nostri diritti</strong> in caso di contestazioni. Base: il nostro legittimo interesse (art. 6.1.f).</li>
      </ul>
      <p>
        Non vendiamo i tuoi dati e non li cediamo a nessuno per fini commerciali.
      </p>

      <H>4. Intelligenza artificiale</H>
      <p>
        Per offrirti un&apos;esperienza migliore e programmi di qualità più alta, il coach si fa aiutare da strumenti di intelligenza artificiale (Claude, di Anthropic). A questi strumenti <strong>non comunichiamo mai nome, cognome, email o telefono</strong>: solo dati pseudonimizzati, cioè non collegabili direttamente a te. L&apos;intelligenza artificiale propone e basta: <strong>ogni decisione la prende il tuo coach</strong>, e ogni messaggio che ricevi lo manda lui. Non c&apos;è alcuna decisione automatizzata ai sensi dell&apos;art. 22 GDPR. Anthropic agisce come nostro responsabile del trattamento e, per contratto, non usa questi dati per addestrare i suoi modelli.
      </p>
      <p>L&apos;intelligenza artificiale fa parte del servizio: il suo uso è compreso in quello che confermi all&apos;inizio (contratto e consenso sui dati relativi alla salute). Se hai dubbi, parlane con il tuo coach prima di confermare.</p>

      <H>5. Foto e video sui social (facoltativo)</H>
      <p>
        Se ce lo permetti con la casella apposita, possiamo pubblicare nelle storie e nei contenuti Instagram (e sugli altri social del brand) alcuni video e foto degli allenamenti fatti insieme durante le sedute di personal training, con la tua immagine e la tua voce. Lo facciamo <strong>gratuitamente</strong> (non è previsto alcun compenso), senza esclusiva, solo per raccontare e promuovere l&apos;attività. I contenuti pubblicati sono visibili agli utenti della piattaforma, che è gestita da Meta.
      </p>
      <p>
        Puoi dire di no senza alcuna conseguenza sul servizio, e cambiare idea quando vuoi dall&apos;app (Percorso → Privacy) o scrivendoci: la revoca vale per il futuro, quello che è già stato pubblicato resta. Se c&apos;è un contenuto in particolare che non ti piace, chiedicelo e lo togliamo.
      </p>

      <H>6. Cosa succede se non ci dai i dati o il consenso</H>
      <p>
        Dati anagrafici e di contatto ci servono per seguirti e per farti entrare nell&apos;app. Senza il consenso sui dati relativi alla salute non possiamo usare l&apos;app per il tuo percorso: parlane con il tuo coach, che valuterà con te come procedere. Il permesso per i social, invece, è del tutto facoltativo.
      </p>

      <H>7. Chi può vedere i tuoi dati</H>
      <ul>
        <li>Il titolare e i <strong>collaboratori</strong> che ti seguono, autorizzati per iscritto e tenuti alla riservatezza (art. 29 GDPR). Un collaboratore vede solo i clienti che segue.</li>
        <li>I <strong>fornitori</strong> che ci permettono di far funzionare l&apos;app, nominati responsabili del trattamento (art. 28 GDPR): Supabase (database e archivio dei file, con server nell&apos;Unione europea, a Francoforte), Vercel (pubblicazione dell&apos;app), Anthropic (intelligenza artificiale), Groq (trascrizione dei messaggi vocali), Resend (invio delle email).</li>
        <li>Il nostro commercialista e consulenti fiscali, banche e istituti di credito, solo per i dati amministrativi necessari.</li>
        <li>Compagnie di assicurazione, avvocati e consulenti, solo se serve per un sinistro o per tutelare i nostri diritti.</li>
        <li>Le autorità (per esempio l&apos;Agenzia delle Entrate), solo se la legge lo impone.</li>
        <li>Solo se ci hai dato il permesso del punto 5: Instagram e gli altri social del brand, e chi li guarda.</li>
      </ul>
      <p>Al di fuori del punto 5 i tuoi dati non vengono diffusi né pubblicati. Gli altri clienti non vedono nulla di te.</p>

      <H>8. Trasferimenti fuori dall&apos;Unione europea</H>
      <p>
        Il database si trova nell&apos;Unione europea. Alcuni fornitori (Vercel, Anthropic, Groq, Resend, la società che gestisce Supabase e, solo per i contenuti social del punto 5, Meta) hanno sede negli Stati Uniti e possono trattare alcuni dati anche lì. In questi casi il trasferimento avviene con le garanzie previste dal GDPR: la decisione di adeguatezza della Commissione europea (EU-US Data Privacy Framework) per i fornitori aderenti, oppure le clausole contrattuali standard approvate dalla Commissione (art. 46 GDPR). Puoi chiederci una copia delle garanzie scrivendo all&apos;indirizzo del punto 1.
      </p>

      <H>9. Come proteggiamo i dati</H>
      <ul>
        <li>Si entra nell&apos;app solo su invito e con password personale.</li>
        <li>I permessi sono controllati direttamente dal database: ognuno vede solo quello che deve vedere.</li>
        <li>Le connessioni sono cifrate; foto, video e vocali della chat stanno in un archivio privato e si aprono solo con link temporanei.</li>
        <li>Agli strumenti di intelligenza artificiale non arrivano nome, cognome e contatti.</li>
      </ul>

      <H>10. Per quanto tempo li conserviamo</H>
      <ul>
        <li><strong>Dati relativi alla salute, foto e video del servizio</strong>: per tutta la durata del percorso e per <strong>5 anni</strong> dalla sua fine, per tutelarci in caso di contestazioni e per permetterti di riprendere da dove eri rimasto; poi li cancelliamo o li rendiamo anonimi. Se revochi il consenso smettiamo di raccoglierli e, se ce lo chiedi, cancelliamo quelli raccolti.</li>
        <li><strong>Video mandati in chat</strong>: si cancellano da soli dopo 6 mesi (resta solo il messaggio).</li>
        <li><strong>Dati anagrafici e del contratto</strong>: per 10 anni dalla fine del rapporto (prescrizione ordinaria, art. 2946 del codice civile).</li>
        <li><strong>Dati contabili e fiscali</strong> (ricevute, fatture, registri): per 10 anni dall&apos;ultima registrazione, come previsto dalla legge (art. 2220 del codice civile).</li>
        <li><strong>Foto e video pubblicati sui social</strong> (punto 5): fino a quando revochi il permesso.</li>
        <li><strong>Email con proposte di servizi simili</strong>: finché non ti opponi.</li>
        <li>In caso di contestazioni, i dati necessari restano fino alla loro conclusione.</li>
      </ul>

      <H>11. I tuoi diritti</H>
      <p>In qualsiasi momento puoi chiederci di:</p>
      <ul>
        <li>sapere quali dati abbiamo e averne una copia (accesso, art. 15);</li>
        <li>correggerli o completarli (rettifica, art. 16);</li>
        <li>cancellarli (art. 17) o limitarne l&apos;uso (art. 18);</li>
        <li>riceverli in un formato leggibile da un computer per portarli altrove (portabilità, art. 20);</li>
        <li>opporti al trattamento basato sul nostro legittimo interesse, comprese le email con proposte di servizi simili (art. 21);</li>
        <li><strong>revocare il consenso</strong>, senza conseguenze sulla liceità di quanto fatto prima (art. 7.3).</li>
      </ul>
      <p>
        Puoi farlo dall&apos;app (Percorso → Privacy) o scrivendo a {email}{pec}. Ti rispondiamo entro un mese. Se pensi che i tuoi dati siano trattati in modo non corretto puoi fare reclamo al Garante per la protezione dei dati personali (<a className="underline" href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">www.garanteprivacy.it</a>).
      </p>

      <H>12. Minorenni</H>
      <p>Se hai meno di 18 anni, l&apos;informativa la legge e il consenso lo dà un genitore o chi ne fa le veci.</p>

      <H>13. Modifiche</H>
      <p>
        Se cambiamo questa informativa in modo importante te lo diciamo nell&apos;app e ti chiediamo di rileggerla. Versione del {formatLong(PRIVACY_VERSION)}.
      </p>
    </div>
  );
}
