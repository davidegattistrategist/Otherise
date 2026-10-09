import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { NotificationList } from "@/components/notification-list";

export const metadata: Metadata = { title: "Notifiche" };

export default async function ClientNotificationsPage() {
  await requireClient();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[30px] leading-tight font-normal tracking-tight">Notifiche</h1>
      <NotificationList />
    </div>
  );
}
