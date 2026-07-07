import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { PROFILE_COOKIE, parseProfileCookie } from "@/lib/auth/profile-cookie";
import { ProfileCookieSync } from "@/components/profile-cookie";
import { createServerSupabase } from "@/lib/db/server";
import { signAudioPaths } from "@/lib/audio/storage";
import ArchiveAudioButton from "./_components/archive-audio-button";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";
import { ArchiveListSkeleton } from "./_components/archive-skeleton";
import LocalTime from "@/components/local-time";
import { bibleComUrlForReference } from "@/lib/reading-plan";

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

type Session = { supabase: SupabaseClient; user: User | null };

async function getSession(): Promise<Session> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// The frame streams immediately on navigation: the only awaited work before
// returning JSX is the cookie read (local, no network); auth + queries start
// here and resolve inside the Suspense children.
export default async function ArchivePage() {
  const sessionPromise = getSession();
  const profile = parseProfileCookie((await cookies()).get(PROFILE_COOKIE)?.value);

  return (
    <ProfileFrame
      tab="log"
      name={
        profile?.name || (
          <Suspense fallback={<NameSkeleton />}>
            <DisplayName sessionPromise={sessionPromise} />
          </Suspense>
        )
      }
    >
      <Suspense fallback={<ArchiveListSkeleton />}>
        <ArchiveList sessionPromise={sessionPromise} />
      </Suspense>
    </ProfileFrame>
  );
}

async function DisplayName({ sessionPromise }: { sessionPromise: Promise<Session> }) {
  const { supabase, user } = await sessionPromise;
  if (!user) return null; // ArchiveList handles the login redirect

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      {profile?.display_name ?? "Unknown"}
      <ProfileCookieSync id={user.id} name={profile?.display_name ?? null} />
    </>
  );
}

async function ArchiveList({ sessionPromise }: { sessionPromise: Promise<Session> }) {
  const { supabase, user } = await sessionPromise;
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("messages")
    .select(
      "id, reference, note, voice_path, transcript, created_at, created_tz, message_shares(chat_id, chats(id, name))",
    )
    .eq("user_id", user.id)
    .not("reference", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Row[];
  const signedUrls = await signAudioPaths(
    supabase,
    rows.map((r) => r.voice_path),
  );

  if (rows.length === 0) {
    return (
      <p className="mt-12 text-center text-sm text-stone-400">
        No logs yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((m) => {
        const shares = (m.message_shares ?? [])
          .map((s) => (Array.isArray(s.chats) ? s.chats[0] : s.chats))
          .filter((c): c is { id: string; name: string | null } => c !== null);

        const body = m.transcript ?? m.note;
        const hasAudio = Boolean(m.voice_path && signedUrls[m.voice_path]);
        const referenceHref = m.reference
          ? bibleComUrlForReference(m.reference)
          : null;

        return (
          <li key={m.id}>
            <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-white">
              <div className="flex items-center gap-3">
                {hasAudio && m.voice_path ? (
                  <ArchiveAudioButton src={signedUrls[m.voice_path]} />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20"
                  >
                    <span className="translate-x-[-0.5px] font-mono text-base italic text-white">
                      t
                    </span>
                  </span>
                )}
                <div className="flex flex-1 items-center justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {referenceHref ? (
                      <a
                        href={referenceHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="active:text-white/70"
                      >
                        {m.reference}
                      </a>
                    ) : (
                      (m.reference ?? "Untitled reading")
                    )}
                  </div>
                  <LocalTime
                    iso={m.created_at}
                    timeZone={m.created_tz}
                    options={{
                      month: "long",
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
  );
}
