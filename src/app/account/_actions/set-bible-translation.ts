"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { isBibleTranslation } from "@/lib/reading-plan";

export async function setBibleTranslation(formData: FormData) {
  const translation = formData.get("translation");
  // The database check constraint would reject unknown values anyway.
  if (!isBibleTranslation(translation)) return;

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({ bible_translation: translation })
    .eq("id", user.id);
  if (error) {
    redirect(`/account?error=${encodeURIComponent(error.message)}`);
  }

  // Every page that links to bible.com renders from this profile column.
  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/archive");
}
