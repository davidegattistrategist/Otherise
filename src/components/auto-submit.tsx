"use client";

import type { ComponentProps } from "react";
import { Select } from "./ui";

/** Una scelta che si salva appena la cambi (invia il suo modulo), senza pulsante "Salva". */
export function AutoSubmitSelect(props: ComponentProps<typeof Select>) {
  return (
    <Select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
