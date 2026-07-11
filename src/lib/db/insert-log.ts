import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPassage } from "@/lib/passage";

// The single owner of the log write path — the home voice/text overlays and
// the chat composer all insert through here.

export const VOICE_BUCKET = "audio-memos";

// iOS Safari's MediaRecorder produces audio/mp4; the file extension has to
// match the codec (Whisper detects format by filename, and playback sniffs).
export function voiceExtension(blob: Blob): "m4a" | "webm" {
  return blob.type.includes("mp4") ? "m4a" : "webm";
}

export async function uploadVoiceBlob(
  supabase: SupabaseClient,
  userId: string,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${voiceExtension(blob)}`;
  const { error } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

export type NewLog = {
  userId: string;
  note: string | null;
  transcript: string | null;
  voicePath: string | null;
  passage: ParsedPassage | null;
};

// Inserts the messages row, then its message_shares rows. `onInserted` fires
// between the two: the chat composer reconciles its optimistic bubble there,
// so by the time the share INSERT reaches the realtime channel the dedupe
// already sees the real id (otherwise the bubble would briefly double).
//
// The .select("id") RETURNING passes RLS because the creator satisfies the
// messages SELECT policy (user_id = auth.uid()) — unlike chats, where
// create-chat.ts must generate the id locally.
export async function insertLogWithShares(
  supabase: SupabaseClient,
  log: NewLog,
  chatIds: Iterable<string>,
  opts?: { onInserted?: (id: string) => void },
): Promise<{ id: string }> {
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      user_id: log.userId,
      note: log.note,
      voice_path: log.voicePath,
      transcript: log.transcript,
      reference: log.passage?.reference ?? null,
      book: log.passage?.book ?? null,
      chapter: log.passage?.chapter ?? null,
      verse_start: log.passage?.verse_start ?? null,
      verse_end: log.passage?.verse_end ?? null,
      created_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    .select("id")
    .single();
  if (error || !inserted) throw error ?? new Error("insert failed");

  opts?.onInserted?.(inserted.id);

  const shareRows = Array.from(chatIds).map((chat_id) => ({
    message_id: inserted.id,
    chat_id,
    shared_by: log.userId,
  }));
  if (shareRows.length > 0) {
    const { error: shareErr } = await supabase
      .from("message_shares")
      .insert(shareRows);
    if (shareErr) throw shareErr;
  }

  return { id: inserted.id };
}
