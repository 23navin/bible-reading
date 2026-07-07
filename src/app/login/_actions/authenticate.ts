"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/server";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/auth/username";
import {
  PROFILE_COOKIE,
  profileCookieOptions,
  serializeProfileCookie,
} from "@/lib/auth/profile-cookie";

async function setProfileCookie(id: string, name: string, planId: string | null) {
  (await cookies()).set(
    PROFILE_COOKIE,
    serializeProfileCookie({ id, name, planId }),
    profileCookieOptions,
  );
}

// Only allow redirect targets that are same-origin paths — anything else
// (protocol-relative `//evil.com`, absolute URLs) gets dropped to "/".
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

function fail(message: string, next: string): never {
  const params = new URLSearchParams({ error: message });
  if (next !== "/") params.set("next", next);
  redirect(`/login?${params.toString()}`);
}

export async function authenticate(formData: FormData) {
  const rawUsername = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const username = normalizeUsername(rawUsername);
  const next = safeNext(formData.get("next"));

  if (!isValidUsername(username)) {
    fail("Username must be 2-32 chars: letters, digits, _ . -", next);
  }
  if (password.length < 3) {
    fail("Password must be at least 6 characters.", next);
  }

  const supabase = await createServerSupabase();
  const email = usernameToEmail(username);

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error) {
    if (signIn.data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, reading_plan_id")
        .eq("id", signIn.data.user.id)
        .maybeSingle();
      if (profile?.display_name) {
        await setProfileCookie(
          signIn.data.user.id,
          profile.display_name,
          profile.reading_plan_id ?? null,
        );
      }
    }
    redirect(next);
  }

  // Sign-in failed. If credentials were invalid, try signing up.
  // Any other case (e.g. wrong password on existing user) surfaces below.
  const isInvalidCreds = /invalid/i.test(signIn.error.message);
  if (!isInvalidCreds) {
    fail(signIn.error.message, next);
  }

  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) {
    // If the account exists, signIn already failed with "invalid creds" -> wrong password.
    fail(
      /already/i.test(signUp.error.message) ? "Wrong password." : signUp.error.message,
      next,
    );
  }

  if (signUp.data.user) {
    await supabase
      .from("profiles")
      .upsert(
        { id: signUp.data.user.id, username, display_name: username },
        { onConflict: "id" },
      );
    await setProfileCookie(signUp.data.user.id, username, null);
  }

  // If email confirmation is enabled, signUp returns no session — surface that clearly.
  if (!signUp.data.session) {
    fail(
      "Account created but no session. Disable 'Confirm email' in Supabase Auth settings.",
      next,
    );
  }

  redirect(next);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  (await cookies()).delete(PROFILE_COOKIE);
  redirect("/login");
}
