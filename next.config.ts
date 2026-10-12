import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tornando su una pagina già vista da poco (es. Oggi ↔ Clienti) si mostra
  // subito senza richiederla al server; salvare qualcosa la aggiorna comunque
  experimental: {
    staleTimes: { dynamic: 20 },
  },
  // il file dell'eserciziario incluso viene letto dal server al primo import
  outputFileTracingIncludes: {
    "/staff/eserciziario": ["./dati/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
