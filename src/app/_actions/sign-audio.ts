"use server";

import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser } from "@/lib/auth/user";
import { signAudioPath } from "@/lib/audio/storage";

// Signs a single voice-memo path on demand (when the user taps play) instead
// of signing every memo on the page up front. Storage RLS decides whether the
// caller may sign this path — same policy that governed the old up-front
// signing, since both use the viewer's cookie-authed client.
export async function signAudio(path: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  if (!user) return null;
  return signAudioPath(supabase, path);
}
