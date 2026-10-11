/** Ordine alfabetico dei clienti per cognome, poi per nome (maiuscole e accenti non contano). */
export function bySurname(a: { first_name: string; last_name: string }, b: { first_name: string; last_name: string }) {
  return a.last_name.localeCompare(b.last_name, "it", { sensitivity: "base" }) || a.first_name.localeCompare(b.first_name, "it", { sensitivity: "base" });
}
