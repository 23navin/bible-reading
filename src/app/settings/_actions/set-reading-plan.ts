"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/db/server";

export async function setReadingPlan(formData: FormData) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("plan") ?? "");
  // The profiles.reading_plan_id foreign key rejects unknown plan ids.
  await supabase
    .from("profiles")
    .update({ reading_plan_id: id || null })
    .eq("id", user.id);

  revalidatePath("/settings/plan");
  revalidatePath("/");
}
