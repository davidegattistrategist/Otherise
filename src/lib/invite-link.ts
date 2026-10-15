/**
 * Chi può ricevere il link per entrare preparato dal trainer: solo un account
 * di cliente (o non ancora assegnato). Mai lo staff: con il link si entra
 * nell'account senza password.
 */
export function linkAllowedForRole(role: string | null | undefined): boolean {
  return role === null || role === undefined || role === "client" || role === "none";
}
