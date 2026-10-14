import "server-only";
/**
 * Funzioni del database aggiunte con gli aggiornamenti: se il file SQL non è
 * ancora stato eseguito su questa installazione la funzione non c'è, e invece
 * di rompere la pagina si usa il modo di prima (`fallback`).
 */
export async function rpcOr<T>(call: PromiseLike<{ data: unknown; error: unknown }>, fallback: () => Promise<T>): Promise<T> {
  const { data, error } = await call;
  if (error || data === null) return fallback();
  return data as T;
}
