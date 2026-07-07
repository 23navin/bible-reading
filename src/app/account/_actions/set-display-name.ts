"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/db/server";
import {
  PROFILE_COOKIE,
  profileCookieOptions,
  serializeProfileCookie,
} from "@/lib/auth/profile-cookie";

export async function setDisplayName(rawName: string) {
  const name = rawName.trim().slice(0, 32);
  if (!name) return;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id);

  // Headers render the name from the profile cookie, so keep it in sync.
  (await cookies()).set(
    PROFILE_COOKIE,
    serializeProfileCookie({ id: user.id, name }),
    profileCookieOptions,
  );

  revalidatePath("/account");
  revalidatePath("/");
}
