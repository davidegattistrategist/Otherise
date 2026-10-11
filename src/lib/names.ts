/** Ordine alfabetico dei clienti per cognome, poi per nome (maiuscole e accenti non contano). */
export function bySurname(a: { first_name: string; last_name: string }, b: { first_name: string; last_name: string }) {
  return a.last_name.localeCompare(b.last_name, "it", { sensitivity: "base" }) || a.first_name.localeCompare(b.first_name, "it", { sensitivity: "base" });
}

/** Nome negli elenchi: prima il cognome, così si trova a colpo d'occhio ("Ippolito Sara"). */
export function listName(c: { first_name: string; last_name: string }): string {
  return `${c.last_name} ${c.first_name}`.trim();
}

/** La ricerca trova il cliente scrivendo sia "nome cognome" sia "cognome nome". */
export function nameMatches(c: { first_name: string; last_name: string }, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return `${c.first_name} ${c.last_name}`.toLowerCase().includes(n) || `${c.last_name} ${c.first_name}`.toLowerCase().includes(n);
}
