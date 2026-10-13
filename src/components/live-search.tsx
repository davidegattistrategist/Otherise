"use client";

/**
 * Casella di ricerca che filtra mentre scrivi (senza dover premere Invio):
 * aggiorna `?q=` nell'indirizzo e la pagina si ricarica con l'elenco filtrato.
 * Gli altri parametri dell'indirizzo (es. ?vista=) restano com'erano.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input, cx } from "./ui";

export function LiveSearch({ id = "q", defaultValue = "", placeholder, label, className }: { id?: string; defaultValue?: string; placeholder: string; label: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [value, pathname, router]);

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
        placeholder={placeholder}
        aria-busy={pending}
        className={cx("max-w-sm transition-opacity", pending && "opacity-70", className)}
      />
    </>
  );
}
