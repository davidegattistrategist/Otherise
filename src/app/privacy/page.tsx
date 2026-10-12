import Link from "next/link";
import type { Metadata } from "next";
import { getMe, homeFor } from "@/lib/auth";
import { getPrivacyOwner } from "@/lib/data/privacy";
import { PrivacyNotice } from "@/components/privacy-notice";
import { BrandName } from "@/components/brand";

export const metadata: Metadata = { title: "Informativa privacy" };

export default async function PrivacyPage() {
  const [owner, me] = await Promise.all([getPrivacyOwner(), getMe()]);
  const back = me ? (me.role === "client" ? "/cliente/profilo" : homeFor(me.role)) : "/login";
  return (
    <main className="mx-auto max-w-[720px] px-5 py-10 sm:py-14">
      <Link href={back} className="text-sm font-semibold text-muted hover:text-ink">← {me ? "Torna all'app" : "Torna all'accesso"}</Link>
      <div className="mt-6 flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
        <BrandName name={owner.businessName} className="text-lg font-bold tracking-tight" />
      </div>
      <h1 className="mt-4 text-[32px] leading-tight font-normal tracking-tight">Informativa sul trattamento dei dati personali</h1>
      <div className="mt-6">
        <PrivacyNotice owner={owner} />
      </div>
    </main>
  );
}
