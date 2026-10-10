import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeScreenName } from "@/lib/app-name";

/** Nome sulla schermata Home: quello dell'attività, se è stato impostato. */
async function appName() {
  try {
    const { data } = await createAdminClient().from("app_settings").select("business_name").eq("id", 1).maybeSingle();
    return data?.business_name?.trim() || "Otherise";
  } catch {
    return "Otherise";
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = await appName();
  return {
    id: "/",
    name,
    short_name: homeScreenName(name),
    description: "Programmi, progressi e percorso di allenamento",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ece6dc",
    theme_color: "#ece6dc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
