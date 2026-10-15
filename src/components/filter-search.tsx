"use client";

/**
 * Ricerca che filtra l'elenco già sulla pagina, nel browser: niente viaggio
 * al server a ogni lettera (prima Clienti rifaceva 10 letture per lettera).
 * Gli elementi da filtrare hanno `data-search="testo in minuscolo"` dentro il
 * contenitore `#target`; un gruppo (`data-search-group`) si nasconde se non
 * ha più righe visibili; `data-search-empty` compare quando non c'è niente;
 * `data-search-only` = riga che compare solo cercandola.
 * La parola cercata resta nell'indirizzo (?q=), così tornando indietro c'è ancora.
 */
import { useEffect, useState } from "react";
import { Input, cx } from "./ui";

export function FilterSearch({ target, defaultValue = "", placeholder, label, id = "q", className }: { target: string; defaultValue?: string; placeholder: string; label: string; id?: string; className?: string }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const root = document.getElementById(target);
    if (!root) return;
    const needle = value.trim().toLowerCase();
    const apply = () => {
      let shown = 0;
      root.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
        // data-search-only: si vede solo cercandolo (es. ex clienti senza chat)
        const ok = needle ? (el.dataset.search ?? "").includes(needle) : !el.hasAttribute("data-search-only");
        if (el.hidden !== !ok) el.hidden = !ok;
        if (ok) shown++;
      });
      root.querySelectorAll<HTMLElement>("[data-search-group]").forEach((g) => {
        const hide = Boolean(needle) && !g.querySelector("[data-search]:not([hidden])");
        if (g.hidden !== hide) g.hidden = hide;
      });
      root.querySelectorAll<HTMLElement>("[data-search-empty]").forEach((e) => {
        const hide = !(needle && shown === 0);
        if (e.hidden !== hide) e.hidden = hide;
      });
    };
    apply();
    // l'elenco si aggiorna da solo (nuovi messaggi…): le righe nuove si filtrano subito
    const watch = new MutationObserver(apply);
    watch.observe(root, { childList: true, subtree: true });
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      if (needle) url.searchParams.set("q", value.trim());
      else url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.toString());
    }, 250);
    return () => {
      clearTimeout(t);
      watch.disconnect();
    };
  }, [value, target]);

  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Input
        id={id}
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={placeholder}
        className={cx("max-w-sm", className)}
      />
    </>
  );
}
