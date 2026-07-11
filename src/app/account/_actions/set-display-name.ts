"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  PROFILE_COOKIE,
  profileCookieOptions,
  parseProfileCookie,
  serializeProfileCookie,
} from "@/lib/auth/profile-cookie";

export async function setDisplayName(rawName: string) {
  const name = rawName.trim().slice(0, 32);
  if (!name) return;

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id);
  if (error) {
    redirect(`/account?error=${encodeURIComponent(error.message)}`);
  }

  // Headers render the name from the profile cookie, so keep it in sync
  // (preserving the cached planId, which this action doesn't touch).
  const cookieStore = await cookies();
  const current = parseProfileCookie(cookieStore.get(PROFILE_COOKIE)?.value);
  cookieStore.set(
    PROFILE_COOKIE,
    serializeProfileCookie({ ...current, id: user.id, name }),
    profileCookieOptions,
  );

  revalidatePath("/account");
  revalidatePath("/");
}
