import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { NotificationList } from "@/components/notification-list";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Notifiche" };

export default async function StaffNotificationsPage() {
  await requireStaff();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle title="Notifiche">
        <p className="text-[15px] text-muted">Check-up con problemi, pagamenti in scadenza, programmi che finiscono. Arrivano anche per email, se configurata.</p>
      </PageTitle>
      <NotificationList />
    </div>
  );
}
