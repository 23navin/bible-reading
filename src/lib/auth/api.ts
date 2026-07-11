import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser, type AuthUser } from "@/lib/auth/user";

// Route-handler variant of the per-page auth check: returns null instead of
// redirecting so routes can respond with 401 JSON. Same local JWT
// verification as pages (see getAuthUser) — no auth-server round trip.
export async function getApiUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabase();
  return getAuthUser(supabase);
}
