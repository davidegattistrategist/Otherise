import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { ClientForm } from "../client-form";
import { createClientAction } from "../actions";

export const metadata: Metadata = { title: "Nuovo cliente" };

export default async function NewClientPage() {
  const me = await requireStaff();
  const supabase = await createClient();
  const { data: coaches } = await supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle eyebrow="Clienti" title="Nuovo cliente" />
      <Card>
        <ClientForm action={createClientAction} coaches={coaches ?? []} isOwner={me.role === "owner"} isNew values={{ start_date: todayISO() }} />
      </Card>
    </div>
  );
}
