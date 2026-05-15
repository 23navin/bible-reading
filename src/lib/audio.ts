import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "audio-memos";
const TTL_SECONDS = 60 * 60; // 1 hour

export async function signAudioPath(
  supabase: SupabaseClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function signAudioPaths(
  supabase: SupabaseClient,
  paths: (string | null)[],
): Promise<Record<string, string>> {
  const valid = paths.filter((p): p is string => !!p);
  if (valid.length === 0) return {};
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(valid, TTL_SECONDS);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
