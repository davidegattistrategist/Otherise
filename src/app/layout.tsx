import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Otherise", template: "%s · Otherise" },
  description: "Programmi, progressi e percorso di allenamento",
  appleWebApp: { capable: true, title: "Otherise", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ece6dc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
