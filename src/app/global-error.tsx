"use client";

/** Errore così grave da non poter mostrare nemmeno la struttura dell'app. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ece6dc", color: "#1b1a17", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <title>Qualcosa non ha funzionato · Otherise</title>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 12px" }}>Qualcosa non ha funzionato.</h1>
          <p style={{ fontSize: 15, color: "#6b665c", margin: "0 0 20px" }}>Controlla la connessione e riprova tra poco{error.digest ? ` (codice ${error.digest})` : ""}.</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", borderRadius: 999, border: 0, background: "#1b1a17", color: "#f6f2eb", fontSize: 15, fontWeight: 600 }}>Riprova</button>
        </div>
      </body>
    </html>
  );
}
