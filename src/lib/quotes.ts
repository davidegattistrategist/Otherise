/**
 * Frase del giorno nella home del cliente: 100 frasi, una al giorno uguale per
 * tutti, in sequenza; finite le 100 si riparte dalla prima. Il giorno si conta
 * da una data fissa (così il ciclo non salta al cambio d'anno).
 */
import { diffDays, type ISODate } from "./dates";

export type Quote = { text: string; author?: string };

/** Primo giorno del ciclo: la frase 1. */
export const QUOTES_START: ISODate = "2026-10-12";

export const QUOTES: Quote[] = [
  { text: "Non serve essere straordinari oggi. Serve esserci." },
  { text: "Chi ha cominciato è a metà dell'opera.", author: "Orazio" },
  { text: "Il corpo ricorda ogni scelta che fai per lui." },
  { text: "Non devi vincere la giornata. Basta non lasciarla andare." },
  { text: "Nessuna grande cosa nasce all'improvviso.", author: "Epitteto" },
  { text: "La costanza è una forma silenziosa di coraggio." },
  { text: "Oggi conta più farlo che farlo perfetto." },
  { text: "Goccia a goccia si scava la pietra.", author: "Ovidio" },
  {
    text: "Allenarsi è un modo di prendersi sul serio, senza prendersi troppo sul serio.",
  },
  { text: "La motivazione va e viene. L'abitudine resta." },
  {
    text: "Non è che abbiamo poco tempo: è che ne perdiamo molto.",
    author: "Seneca",
  },
  { text: "Sii gentile con chi eri, esigente con chi stai diventando." },
  { text: "Muoversi è il modo più semplice per cambiare umore." },
  { text: "Mens sana in corpore sano.", author: "Giovenale" },
  { text: "La fatica di oggi è la leggerezza di domani." },
  { text: "Non confrontarti con gli altri. Confrontati con te, ieri." },
  { text: "Il lavoro tenace vince ogni cosa.", author: "Virgilio" },
  { text: "Il progresso raramente fa rumore. Ma si vede." },
  {
    text: "Il corpo non è un progetto da correggere: è una casa da abitare bene.",
  },
  { text: "Mentre si rimanda, la vita passa.", author: "Seneca" },
  { text: "La disciplina è ricordarsi cosa si vuole davvero." },
  { text: "Fai oggi qualcosa di cui domani ti ringrazierai." },
  { text: "Possono, perché credono di potere.", author: "Virgilio" },
  { text: "Un'ora di allenamento è il 4% della tua giornata. Usala bene." },
  { text: "Respira. Comincia. Il resto viene." },
  { text: "L'ostacolo diventa la strada.", author: "Marco Aurelio" },
  { text: "Non aspettare di sentirti pronto. Ci si sente pronti facendo." },
  { text: "La forza vera è sapere quando spingere e quando riposare." },
  {
    text: "Un viaggio di mille miglia comincia con un passo.",
    author: "Lao Tzu",
  },
  { text: "Il tuo ritmo è quello giusto, finché non ti fermi." },
  { text: "Anche i giorni storti valgono, se li attraversi." },
  { text: "Diventa ciò che sei.", author: "Pindaro" },
  { text: "Allenarsi non è punirsi: è ringraziarsi." },
  { text: "Le scuse sono comode. I risultati lo sono di più, dopo." },
  {
    text: "Fatti non foste a viver come bruti, ma per seguir virtute e canoscenza.",
    author: "Dante",
  },
  { text: "Piccoli gesti, ripetuti, fanno grandi differenze." },
  { text: "Il tempo per te non si trova: si prende." },
  {
    text: "Non è perché le cose sono difficili che non osiamo; è perché non osiamo che sono difficili.",
    author: "Seneca",
  },
  { text: "Ascolta il corpo. Ha più buon senso di quanto pensi." },
  { text: "La versione migliore di te non ha fretta." },
  {
    text: "Come il ferro arrugginisce senza esercizio, così l'ingegno si guasta.",
    author: "Leonardo da Vinci",
  },
  { text: "Muoversi è una conversazione con sé stessi. Oggi cosa vi dite?" },
  { text: "Non cercare la giornata perfetta. Costruisci una buona settimana." },
  { text: "Chi ha un perché sopporta quasi ogni come.", author: "Nietzsche" },
  { text: "Ricordi perché hai iniziato? Riparti da lì." },
  { text: "La fatica è il segno che qualcosa sta cambiando." },
  {
    text: "Nessun vento è favorevole per chi non sa dove andare.",
    author: "Seneca",
  },
  { text: "Fare poco è infinitamente meglio di non fare niente." },
  { text: "Sii paziente con i risultati e fedele all'impegno." },
  {
    text: "Non sono le cose a turbarci, ma i giudizi che ne diamo.",
    author: "Epitteto",
  },
  { text: "Il miglior allenamento è quello che fai davvero." },
  { text: "Una buona giornata comincia spesso da un corpo che si è mosso." },
  {
    text: "Va' con fiducia nella direzione dei tuoi sogni.",
    author: "Thoreau",
  },
  {
    text: "Non sei in ritardo. Sei esattamente dove comincia il tuo percorso.",
  },
  { text: "L'energia non si trova: si genera muovendosi." },
  { text: "Non basta volere, bisogna anche fare.", author: "Goethe" },
  { text: "Ogni volta che ti presenti, la fiducia in te cresce un po'." },
  { text: "La salute è il lusso più sottovalutato." },
  {
    text: "Non si può scendere due volte nello stesso fiume.",
    author: "Eraclito",
  },
  { text: "Il cambiamento non chiede rivoluzioni: chiede ripetizioni." },
  { text: "Rallentare non è arrendersi." },
  {
    text: "Soffriamo più nell'immaginazione che nella realtà.",
    author: "Seneca",
  },
  {
    text: "La parte più difficile è cominciare. Dopo, la strada è in discesa.",
  },
  { text: "Il tuo corpo può più di quanto la mente gli conceda." },
  {
    text: "Smetti di discutere su come debba essere un uomo buono. Sii uno.",
    author: "Marco Aurelio",
  },
  { text: "Allenarsi è investire in anni, non solo in muscoli." },
  { text: "Vale anche oggi che sei stanco. Soprattutto oggi." },
  { text: "Finché vivi, continua a imparare come vivere.", author: "Seneca" },
  { text: "L'eleganza di un gesto nasce da mille ripetizioni." },
  {
    text: "Non serve motivazione per cominciare. Serve cominciare per trovarla.",
  },
  { text: "Chi conosce sé stesso è illuminato.", author: "Lao Tzu" },
  { text: "Il benessere non è un traguardo: è un modo di camminare." },
  { text: "Ogni allenamento finito è una promessa mantenuta a te stesso." },
  { text: "Carpe diem.", author: "Orazio" },
  { text: "Più forte non vuol dire più duro. Vuol dire più capace." },
  { text: "Concediti il piacere di essere fiero di te." },
  {
    text: "La cosa più grande al mondo è saper essere di sé stessi.",
    author: "Montaigne",
  },
  {
    text: "Non devi sentirti bene per allenarti. Ti alleni per sentirti bene.",
  },
  { text: "Il riposo fa parte dell'allenamento, non è il suo contrario." },
  {
    text: "Guarda dentro: dentro c'è la sorgente del bene.",
    author: "Marco Aurelio",
  },
  {
    text: "Le giornate piene sono un motivo in più per proteggere la tua ora.",
  },
  { text: "Oggi fai la tua parte. Il tempo farà la sua." },
  { text: "Nessuno ti chiede di essere perfetto. Solo presente." },
  { text: "Il corpo cambia piano. Tu continua." },
  {
    text: "Allenarsi con costanza è la forma più concreta di rispetto per sé.",
  },
  { text: "Quando non sai da dove cominciare, comincia dal respiro." },
  {
    text: "Una scelta buona non cancella quella sbagliata, ma la rende più piccola.",
  },
  { text: "Fai spazio a te, prima che lo occupi qualcos'altro." },
  { text: "Il passo che fai oggi è quello che conta." },
  { text: "La serenità si allena, come le gambe." },
  { text: "Il tempo fugge e non torna.", author: "Virgilio" },
  {
    text: "Il benessere non sembra urgente finché non lo diventa. Anticipalo.",
  },
  { text: "Fallo con calma, ma fallo." },
  {
    text: "Non esiste un corpo giusto. Esiste un corpo che stai trattando bene.",
  },
  {
    text: "Sei più costante di quanto ricordi. Guarda quanta strada hai fatto.",
  },
  { text: "La forza più utile è quella che ti fa rialzare." },
  {
    text: "Ci sono giorni per spingere e giorni per esserci. Contano entrambi.",
  },
  { text: "Hai già fatto cose più difficili di questa." },
  { text: "Oggi è un ottimo giorno per essere un po' meglio di ieri." },
  { text: "Grazie per esserti scelto, anche oggi." },
];

/** Numero della frase del giorno (da 1 a 100) e la frase. */
export function quoteOfDay(today: ISODate): { n: number; quote: Quote } {
  const i =
    ((diffDays(QUOTES_START, today) % QUOTES.length) + QUOTES.length) %
    QUOTES.length;
  return { n: i + 1, quote: QUOTES[i] };
}
