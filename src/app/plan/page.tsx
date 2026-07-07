import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";
import { ProfileCookieSync } from "@/components/profile-cookie";
import { PROFILE_COOKIE, parseProfileCookie } from "@/lib/auth/profile-cookie";
import { CheckIcon } from "@/components/icons";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser, type AuthUser } from "@/lib/auth/user";
import {
  bibleComUrl,
  formatEntryPassage,
  type ReadingPlan,
  type ReadingPlanEntry,
} from "@/lib/reading-plan";
import ArchiveAudioButton from "@/app/archive/_components/archive-audio-button";
import LocalTime from "@/components/local-time";
import { PlanSkeleton } from "./_components/plan-skeleton";
import { setReadingPlan } from "./_actions/set-reading-plan";

export const dynamic = "force-dynamic";

type PlanRow = ReadingPlan & { reading_plan_entries: { count: number }[] };

type EntryRow = Pick<ReadingPlanEntry, "date" | "begin_chapter" | "end_chapter">;

type LogRow = {
  id: string;
  reference: string | null;
  note: string | null;
  voice_path: string | null;
  transcript: string | null;
  created_at: string;
  created_tz: string | null;
};

type ProgressRow = {
  date: string;
  completed_at: string;
  messages: LogRow | LogRow[] | null;
};

type PlanData = {
  user: AuthUser | null;
  displayName: string | null;
  selectedId: string | null;
  plans: PlanRow[];
  entries: EntryRow[];
  logByDate: Map<string, LogRow>;
  completedAtByDate: Map<string, string>;
};

// Days of a plan plus the progress rows (with their completing logs).
async function fetchPlanDetail(supabase: SupabaseClient, userId: string, planId: string) {
  const [{ data: entryRows }, { data: progressRows }] = await Promise.all([
    supabase
      .from("reading_plan_entries")
      .select("date, begin_chapter, end_chapter")
      .eq("plan_id", planId)
      .order("date", { ascending: true }),
    supabase
      .from("reading_plan_progress")
      .select(
        "date, completed_at, messages(id, reference, note, voice_path, transcript, created_at, created_tz)",
      )
      .eq("user_id", userId)
      .eq("plan_id", planId),
  ]);
  return {
    entries: (entryRows ?? []) as EntryRow[],
    progress: (progressRows ?? []) as ProgressRow[],
  };
}

// Everything the page needs, in (usually) one database round trip: the JWT is
// verified locally, so user.id is known without a network hop, and the
// profile cookie caches the selected plan id, so the entries/progress queries
// can run alongside the profiles/plans queries instead of after them. The
// profiles row stays authoritative: a stale cookie just costs one extra
// round trip to refetch the right plan.
async function loadPlanData(cookiePlanId: string | null | undefined): Promise<PlanData> {
  const empty: PlanData = {
    user: null,
    displayName: null,
    selectedId: null,
    plans: [],
    entries: [],
    logByDate: new Map(),
    completedAtByDate: new Map(),
  };

  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  if (!user) return empty;

  const guessPromise =
    typeof cookiePlanId === "string"
      ? fetchPlanDetail(supabase, user.id, cookiePlanId)
      : null;
  // The guess may be discarded below (stale cookie) — don't let its failure
  // surface as an unhandled rejection.
  guessPromise?.catch(() => {});

  const [{ data: profileRow }, { data: planRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("reading_plan_id, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("reading_plans")
      .select("id, display_name, description, reading_plan_entries(count)")
      .order("display_name"),
  ]);

  const selectedId = profileRow?.reading_plan_id ?? null;

  let entries: EntryRow[] = [];
  const logByDate = new Map<string, LogRow>();
  const completedAtByDate = new Map<string, string>();
  if (selectedId) {
    const detail =
      guessPromise && cookiePlanId === selectedId
        ? await guessPromise
        : await fetchPlanDetail(supabase, user.id, selectedId);
    entries = detail.entries;
    for (const p of detail.progress) {
      completedAtByDate.set(p.date, p.completed_at);
      const log = Array.isArray(p.messages) ? p.messages[0] : p.messages;
      if (log) logByDate.set(p.date, log);
    }
  }

  return {
    user,
    displayName: profileRow?.display_name ?? null,
    selectedId,
    plans: (planRows ?? []) as PlanRow[],
    entries,
    logByDate,
    completedAtByDate,
  };
}

// Like /archive, the frame streams immediately: only the cookie read is
// awaited before returning JSX; the data resolves inside Suspense.
export default async function ReadingPlanPage() {
  const profile = parseProfileCookie((await cookies()).get(PROFILE_COOKIE)?.value);
  const dataPromise = loadPlanData(profile?.planId);

  return (
    <ProfileFrame
      tab="plan"
      contentClassName="px-8"
      name={
        profile?.name || (
          <Suspense fallback={<NameSkeleton />}>
            <DisplayName dataPromise={dataPromise} />
          </Suspense>
        )
      }
    >
      <Suspense fallback={<PlanSkeleton />}>
        <PlanContent dataPromise={dataPromise} />
      </Suspense>
    </ProfileFrame>
  );
}

async function DisplayName({ dataPromise }: { dataPromise: Promise<PlanData> }) {
  const { user, displayName } = await dataPromise;
  if (!user) return null; // PlanContent handles the login redirect
  return <>{displayName ?? "Unknown"}</>;
}

async function PlanContent({ dataPromise }: { dataPromise: Promise<PlanData> }) {
  const {
    user,
    displayName,
    selectedId,
    plans,
    entries,
    logByDate,
    completedAtByDate,
  } = await dataPromise;
  if (!user) redirect("/login");

  return (
    <>
      <ProfileCookieSync id={user.id} name={displayName} planId={selectedId} />
      <form action={setReadingPlan} className="flex flex-col gap-1">
        <PlanOption id="" name="No plan" selected={selectedId === null} />
        {plans.map((plan) => (
          <PlanOption
            key={plan.id}
            id={plan.id}
            name={plan.display_name}
            detail={`${plan.reading_plan_entries[0]?.count ?? 0} days`}
            description={plan.description}
            selected={selectedId === plan.id}
          />
        ))}
      </form>

      {entries.length > 0 ? (
        <ul className="-mx-4 mt-8 flex flex-col gap-3 pb-8">
          {entries.map((entry) => (
            <li key={entry.date}>
              <EntryCard
                entry={entry}
                log={logByDate.get(entry.date) ?? null}
                completedAt={completedAtByDate.get(entry.date) ?? null}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function EntryCard({
  entry,
  log,
  completedAt,
}: {
  entry: EntryRow;
  log: LogRow | null;
  completedAt: string | null;
}) {
  // Completed entries show when they were logged (in the author's timezone
  // when the log recorded one); pending ones show the plan's scheduled date,
  // which is date-only and safe to format on the server.
  const loggedAt = log?.created_at ?? completedAt;
  const dateLabel = loggedAt ? (
    <LocalTime
      iso={loggedAt}
      timeZone={log?.created_tz}
      options={{ month: "long", day: "numeric" }}
    />
  ) : (
    new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    })
  );
  const passage = formatEntryPassage(entry);
  const href = bibleComUrl(entry);

  if (!log) {
    return (
      <div className="rounded-2xl bg-neutral-800/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-neutral-400 active:text-neutral-500"
              >
                {passage}
              </a>
            ) : (
              <span className="text-sm font-semibold text-neutral-400">
                {passage}
              </span>
            )}
            {completedAt ? (
              <CheckIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-neutral-500">{dateLabel}</span>
        </div>
      </div>
    );
  }

  const body = log.transcript ?? log.note;
  return (
    <div className="rounded-2xl bg-neutral-800 px-4 py-2.5 text-white">
      <div className="flex items-center gap-3">
        {log.voice_path ? (
          <ArchiveAudioButton path={log.voice_path} />
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
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="active:text-white/70"
              >
                {passage}
              </a>
            ) : (
              passage
            )}
          </div>
          <span className="shrink-0 text-xs text-white/70">{dateLabel}</span>
        </div>
      </div>
      {body ? (
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-snug">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function PlanOption({
  id,
  name,
  detail,
  description,
  selected,
}: {
  id: string;
  name: string;
  detail?: string;
  description?: string | null;
  selected: boolean;
}) {
  return (
    <button
      type="submit"
      name="plan"
      value={id}
      className="flex flex-col gap-1 rounded-md py-2 text-left active:bg-neutral-800"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-lg text-neutral-100">{name}</span>
        </span>
        {selected ? (
          <CheckIcon className="h-5 w-5 shrink-0 text-neutral-100" />
        ) : null}
      </span>
      {selected && description ? (
        <span className="text-sm leading-snug text-neutral-400">{description}</span>
      ) : null}
    </button>
  );
}
