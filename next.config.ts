import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
