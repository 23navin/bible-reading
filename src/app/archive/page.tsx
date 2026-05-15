import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { signAudioPaths } from "@/lib/audio";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  reference: string | null;
  note: string | null;
  voice_path: string | null;
  transcript: string | null;
  created_at: string;
  message_shares: { chat_id: string; chats: { id: string; name: string | null } | { id: string; name: string | null }[] | null }[] | null;
};

export default async function ArchivePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("messages")
    .select(
      "id, reference, note, voice_path, transcript, created_at, message_shares(chat_id, chats(id, name))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Row[];
  const signedUrls = await signAudioPaths(
    supabase,
    rows.map((r) => r.voice_path),
  );

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link href="/" className="text-blue-500 active:text-blue-700">
          ← Home
        </Link>
        <h1 className="text-base font-semibold">Your archive</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {rows.length === 0 ? (
          <p className="mt-12 text-center text-sm text-stone-400">
            No readings yet. Tap the mic on the home screen.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((m) => {
              const date = new Date(m.created_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
              const shares = (m.message_shares ?? [])
                .map((s) => (Array.isArray(s.chats) ? s.chats[0] : s.chats))
                .filter((c): c is { id: string; name: string | null } => c !== null);

              return (
                <li
                  key={m.id}
                  className="rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-semibold">
                      {m.reference ?? "Untitled reading"}
                    </div>
                    <div className="text-xs text-stone-400">{date}</div>
                  </div>
                  {m.note || m.transcript ? (
                    <p className="mt-1 whitespace-pre-wrap text-[15px] text-stone-700">
                      {m.note ?? m.transcript}
                    </p>
                  ) : null}
                  {m.voice_path && signedUrls[m.voice_path] ? (
                    <audio
                      controls
                      src={signedUrls[m.voice_path]}
                      className="mt-2 h-9 w-full"
                    />
                  ) : null}
                  {shares.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {shares.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
                        >
                          {c.name ?? "chat"}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
