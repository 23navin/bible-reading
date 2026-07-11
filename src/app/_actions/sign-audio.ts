"use server";

import { getSession } from "@/lib/auth/session";
import { signAudioPath } from "@/lib/audio/storage";

// Signs a single voice-memo path on demand (when the user taps play) instead
// of signing every memo on the page up front. Storage RLS decides whether the
// caller may sign this path — same policy that governed the old up-front
// signing, since both use the viewer's cookie-authed client.
// Returns null (not a redirect) on missing auth: callers await a value.
export async function signAudio(path: string): Promise<string | null> {
  const { supabase, user } = await getSession();
  if (!user) return null;
  return signAudioPath(supabase, path);
}
