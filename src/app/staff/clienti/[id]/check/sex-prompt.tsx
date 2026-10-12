import { Button, Card, Eyebrow } from "@/components/ui";
import { setClientSex } from "./actions";

/** Per i check serve il sesso (7 pliche uomo, 5 donna): se manca lo si sceglie qui. */
export function SexPrompt({ clientId }: { clientId: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>Prima di fare un check</Eyebrow>
      <p className="text-[15px] leading-relaxed">Indica se è uomo o donna: decide le pliche da misurare (7 per l&apos;uomo, 5 per la donna) e le formule.</p>
      <div className="flex flex-wrap gap-2">
        <form action={setClientSex.bind(null, clientId, "F")}><Button type="submit" variant="secondary">Donna</Button></form>
        <form action={setClientSex.bind(null, clientId, "M")}><Button type="submit" variant="secondary">Uomo</Button></form>
      </div>
    </Card>
  );
}
