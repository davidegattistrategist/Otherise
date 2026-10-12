/**
 * Nome dell'attività accanto al pallino arancione. Se l'attività si chiama
 * "Otherise" (o il nome manca) si vede il logo vero, con le lettere "glitch";
 * altrimenti il nome scritto. Il logo prende il colore del testo (maschera CSS).
 */
import type { CSSProperties } from "react";
import { cx } from "./ui";

export const isOtherise = (name: string | null | undefined) => !name || name.trim().toLowerCase() === "otherise";

const LOGO: CSSProperties = {
  height: "0.74em",
  aspectRatio: "3616 / 472",
  WebkitMaskImage: "url(/logo-otherise.svg)",
  maskImage: "url(/logo-otherise.svg)",
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "left center",
  maskPosition: "left center",
};

export function BrandName({ name, className }: { name: string | null | undefined; className?: string }) {
  if (isOtherise(name)) {
    return (
      <span className={cx("inline-flex items-center", className)}>
        <span role="img" aria-label="Otherise" className="inline-block shrink-0 bg-current" style={LOGO} />
      </span>
    );
  }
  return <span className={cx("truncate", className)}>{name}</span>;
}
