import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser, type AuthUser } from "@/lib/auth/user";

export type Session = { supabase: SupabaseClient; user: AuthUser | null };

// Non-redirecting variant for streamed pages (/archive, /plan): the promise
// is created before returning JSX and awaited inside Suspense, where the
// caller decides how a null user is handled.
export async function getSession(): Promise<Session> {
  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  return { supabase, user };
}

// The standard gate for pages and server actions. The proxy also gates
// requests, but server actions POST to the page route they're used on, so
// every entry point still verifies for itself.
export async function requireUser(): Promise<{
  supabase: SupabaseClient;
  user: AuthUser;
}> {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  return { supabase, user };
}
