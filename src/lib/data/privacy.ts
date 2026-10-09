import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PrivacyOwner } from "@/lib/privacy";

/** Dati del titolare per l'informativa (letti dal server: la pagina è pubblica). */
export const getPrivacyOwner = cache(async (): Promise<PrivacyOwner> => {
  const { data } = await createAdminClient()
    .from("app_settings")
    .select("business_name, legal_name, legal_address, legal_tax_id, privacy_email")
    .eq("id", 1)
    .maybeSingle();
  return {
    businessName: data?.business_name ?? "Otherise",
    legalName: data?.legal_name ?? "",
    legalAddress: data?.legal_address ?? "",
    legalTaxId: data?.legal_tax_id ?? "",
    privacyEmail: data?.privacy_email ?? "",
  };
});
