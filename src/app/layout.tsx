import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Splash } from "@/components/splash";
import { AutoGrow } from "@/components/auto-grow";
import "@fontsource-variable/manrope";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: { default: "Otherise", template: "%s · Otherise" },
  description: "Programmi, progressi e percorso di allenamento",
  appleWebApp: { capable: true, title: "Otherise", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ece6dc",
  width: "device-width",
  initialScale: 1,
  // occupa tutto lo schermo: i margini per notch e angoli arrotondati li gestiamo noi (safe-area)
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="min-h-dvh">
        {/* all'apertura dell'app si vede subito il logo animato mentre arrivano i dati */}
        <Suspense fallback={<Splash />}>{children}</Suspense>
        <ServiceWorker />
        <AutoGrow />
      </body>
    </html>
  );
}
