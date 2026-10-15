import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { NotificationList } from "@/components/notification-list";
import { PageTitle } from "@/components/ui";
import { PushSettings } from "@/components/push";

export const metadata: Metadata = { title: "Notifiche" };

export default async function StaffNotificationsPage() {
  await requireStaff();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle title="Notifiche">
        <p className="text-[15px] text-muted">Diari con problemi, pagamenti in scadenza, programmi che finiscono. Arrivano sul telefono se attivi le notifiche; per email solo se lo scegli in <Link href="/staff/impostazioni#email" className="font-semibold underline">Impostazioni → Avvisi per email</Link>.</p>
      </PageTitle>
      <PushSettings />
      <NotificationList />
    </div>
  );
}
