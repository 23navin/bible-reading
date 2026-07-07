"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser } from "@/lib/auth/user";
import { isBibleTranslation } from "@/lib/reading-plan";

export async function setBibleTranslation(formData: FormData) {
  const translation = formData.get("translation");
  // The database check constraint would reject unknown values anyway.
  if (!isBibleTranslation(translation)) return;

  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ bible_translation: translation })
    .eq("id", user.id);

  // Every page that links to bible.com renders from this profile column.
  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/archive");
}
