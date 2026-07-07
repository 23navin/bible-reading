import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_COOKIE, parseProfileCookie } from "@/lib/auth/profile-cookie";
import { ProfileCookieSync } from "@/components/profile-cookie";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser, type AuthUser } from "@/lib/auth/user";
import ArchiveAudioButton from "./_components/archive-audio-button";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";
import { ArchiveListSkeleton } from "./_components/archive-skeleton";
import LocalTime from "@/components/local-time";
import { bibleComUrlForReference } from "@/lib/reading-plan";

export const dynamic = "force-dynamic";

// Recent logs shown by default; ?all=1 raises the cap to ALL_LIMIT.
const INITIAL_LIMIT = 30;
const ALL_LIMIT = 200;

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

type Session = { supabase: SupabaseClient; user: AuthUser | null };

async function getSession(): Promise<Session> {
  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  return { supabase, user };
}

// The frame streams immediately on navigation: the only awaited work before
// returning JSX is the cookie/searchParams read (local, no network); auth +
// queries start here and resolve inside the Suspense children.
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const sessionPromise = getSession();
  const profile = parseProfileCookie((await cookies()).get(PROFILE_COOKIE)?.value);
  const showAll = (await searchParams).all === "1";

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
        <ArchiveList sessionPromise={sessionPromise} showAll={showAll} />
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

async function ArchiveList({
  sessionPromise,
  showAll,
}: {
  sessionPromise: Promise<Session>;
  showAll: boolean;
}) {
  const { supabase, user } = await sessionPromise;
  if (!user) redirect("/login");

  // One extra row past the cap tells us whether a "Show all" link is needed.
  const limit = showAll ? ALL_LIMIT : INITIAL_LIMIT;
  const { data } = await supabase
    .from("messages")
    .select(
      "id, reference, note, voice_path, transcript, created_at, created_tz, message_shares(chat_id, chats(id, name))",
    )
    .eq("user_id", user.id)
    .not("reference", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  const hasMore = (data ?? []).length > limit;
  const rows = ((data ?? []) as Row[]).slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="mt-12 text-center text-sm text-neutral-400">
        No logs yet.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((m) => {
          const shares = (m.message_shares ?? [])
            .map((s) => (Array.isArray(s.chats) ? s.chats[0] : s.chats))
            .filter((c): c is { id: string; name: string | null } => c !== null);

          const body = m.transcript ?? m.note;
          const referenceHref = m.reference
            ? bibleComUrlForReference(m.reference)
            : null;

          return (
            <li key={m.id}>
              <div className="rounded-2xl bg-neutral-800 px-4 py-2.5 text-white">
                <div className="flex items-center gap-3">
                  {m.voice_path ? (
                    <ArchiveAudioButton path={m.voice_path} />
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
      {hasMore && !showAll ? (
        <div className="mt-4 pb-4 text-center">
          <Link
            href="/archive?all=1"
            className="text-sm font-medium text-neutral-400 active:text-white"
          >
            Show all
          </Link>
        </div>
      ) : null}
    </>
  );
}
