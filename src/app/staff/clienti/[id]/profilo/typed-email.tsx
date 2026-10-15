"use client";

/**
 * Campo nascosto con l'email scritta in quel momento nella scheda (anche se
 * non ancora salvata): così "Rimanda l'invito" e "Prepara il link" usano
 * l'email corretta e non quella vecchia.
 */
import { useEffect, useState } from "react";

export function TypedEmail() {
  const [value, setValue] = useState("");
  useEffect(() => {
    const field = document.querySelector<HTMLInputElement>("input[data-client-email]");
    if (!field) return;
    const sync = () => setValue(field.value);
    sync();
    field.addEventListener("input", sync);
    return () => field.removeEventListener("input", sync);
  }, []);
  return <input type="hidden" name="email" value={value} />;
}
