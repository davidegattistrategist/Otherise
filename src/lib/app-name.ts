/** Nome sotto l'icona sulla schermata Home (lo stesso del manifest). */
export function homeScreenName(name: string | null | undefined) {
  const n = name?.trim() || "Otherise";
  return n.length > 14 ? n.split(" ")[0] : n;
}
