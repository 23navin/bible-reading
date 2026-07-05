import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/server";
import { signAudioPaths } from "@/lib/audio/storage";
import ArchiveAudioButton from "./_components/archive-audio-button";
import { Shell, Header, Body } from "@/components/shell";
import LocalTime from "@/components/local-time";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  reference: string | null;
  note: string | null;
  voice_path: string | null;
  transcript: string | null;
  created_at: string;
  created_tz: string | null;
  message_shares: { chat_id: string; chats: { id: string; name: string | null } | { id: string; name: string | null }[] | null }[] | null;
};

export default async function ArchivePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, reference, note, voice_path, transcript, created_at, created_tz, message_shares(chat_id, chats(id, name))",
      )
      .eq("user_id", user.id)
      .not("reference", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  const displayName = profile?.display_name ?? "Unknown";

  const rows = (data ?? []) as Row[];
  const signedUrls = await signAudioPaths(
    supabase,
    rows.map((r) => r.voice_path),
  );

  return (
    <Shell>
      <Header className="flex items-center gap-3 bg-zinc-900 px-4 py-2">
        <Link
          href="/"
          aria-label="Home"
          className="-m-2 flex h-10 w-10 items-center justify-center text-zinc-300 active:text-zinc-100"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden
          >
            <path d="M15 18L9 12l6-6" />
          </svg>
        </Link>
        <h1 className="flex-1 truncate text-center text-base font-semibold">
          {displayName}&apos;s personal log
        </h1>
        <span aria-hidden className="h-10 w-10" />
      </Header>

      <Body className="px-3 py-4">
        {rows.length === 0 ? (
          <p className="mt-12 text-center text-sm text-stone-400">
            No readings yet. Tap the mic on the home screen.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((m) => {
              const shares = (m.message_shares ?? [])
                .map((s) => (Array.isArray(s.chats) ? s.chats[0] : s.chats))
                .filter((c): c is { id: string; name: string | null } => c !== null);

              const body = m.transcript ?? m.note;
              const hasAudio = Boolean(m.voice_path && signedUrls[m.voice_path]);

              return (
                <li key={m.id}>
                  <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-white">
                    <div className="flex items-center gap-3">
                      {hasAudio && m.voice_path ? (
                        <ArchiveAudioButton src={signedUrls[m.voice_path]} />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 font-mono text-base italic text-white"
                        >
                          t
                        </span>
                      )}
                      <div className="flex flex-1 items-center justify-between gap-3">
                        <div className="text-sm font-semibold">
                          {m.reference ?? "Untitled reading"}
                        </div>
                        <LocalTime
                          iso={m.created_at}
                          timeZone={m.created_tz}
                          options={{
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          }}
                          className="shrink-0 text-xs text-white/70"
                        />
                      </div>
                    </div>
                    {body ? (
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-snug">
                        {body}
                      </p>
                    ) : null}
                    {shares.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {shares.map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white"
                          >
                            {c.name ?? "chat"}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Body>
    </Shell>
  );
}
