import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { Card, PageTitle } from "@/components/ui";
import { ExerciseForm } from "../exercise-form";
import { saveExercise } from "../actions";

export const metadata: Metadata = { title: "Nuovo esercizio" };

export default async function NewExercisePage() {
  await requireStaff();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageTitle eyebrow="Eserciziario" title="Nuovo esercizio" />
      <Card><ExerciseForm action={saveExercise.bind(null, null)} /></Card>
    </div>
  );
}
