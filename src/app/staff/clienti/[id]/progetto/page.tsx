import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { defaultStart, emptyProject, parseProject } from "@/lib/project";
import { ProjectEditor } from "./project-editor";
import { saveProject } from "./actions";

export const metadata: Metadata = { title: "Progetto" };

export default async function ClientProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const { data } = await supabase.from("client_projects").select("data, visible, updated_at").eq("client_id", id).maybeSingle();
  const project = parseProject(data?.data) ?? emptyProject(defaultStart(todayISO()));
  return (
    <ProjectEditor
      initial={project}
      initialVisible={data?.visible ?? false}
      isNew={!data}
      clientName={client.first_name}
      canNotify={Boolean(client.user_id)}
      today={todayISO()}
      save={saveProject.bind(null, id)}
    />
  );
}
