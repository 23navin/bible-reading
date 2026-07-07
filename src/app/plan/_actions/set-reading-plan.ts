"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser } from "@/lib/auth/user";
import {
  PROFILE_COOKIE,
  profileCookieOptions,
  parseProfileCookie,
  serializeProfileCookie,
} from "@/lib/auth/profile-cookie";

export async function setReadingPlan(formData: FormData) {
  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/login");

  const id = String(formData.get("plan") ?? "");
  // The profiles.reading_plan_id foreign key rejects unknown plan ids.
  const { error } = await supabase
    .from("profiles")
    .update({ reading_plan_id: id || null })
    .eq("id", user.id);

  // /plan prefetches the selected plan's entries from the cookie, so keep it
  // in step with the profile row.
  if (!error) {
    const cookieStore = await cookies();
    const current = parseProfileCookie(cookieStore.get(PROFILE_COOKIE)?.value);
    if (current) {
      cookieStore.set(
        PROFILE_COOKIE,
        serializeProfileCookie({ ...current, planId: id || null }),
        profileCookieOptions,
      );
    }
  }

  revalidatePath("/plan");
  revalidatePath("/");
}
