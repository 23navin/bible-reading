import type { SupabaseClient } from "@supabase/supabase-js";

// The subset of the auth user that pages actually use. Derived from JWT
// claims, not the auth server's user record.
export type AuthUser = { id: string; email: string | null };

// Verifies the session via supabase.auth.getClaims() instead of getUser().
// The project signs JWTs with an asymmetric ES256 key, so verification runs
// locally against the (cached) JWKS — no round trip to the auth server on
// every request. getClaims falls back to a server-side check if the token
// were ever signed symmetrically, so this is never less safe than getUser.
export async function getAuthUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getClaims();
  if (!data) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
}
