import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Otherise",
    short_name: "Otherise",
    start_url: "/",
    display: "standalone",
    background_color: "#ece6dc",
    theme_color: "#ece6dc",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
