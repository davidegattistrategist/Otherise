import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";

export default async function Home() {
  const me = await getMe();
  if (!me) redirect("/login");
  redirect(homeFor(me.role));
}
