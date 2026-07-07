import { redirect } from "next/navigation";
import { ProfileFrame } from "@/components/profile-frame";
import { ProfileCookieSync } from "@/components/profile-cookie";
import { CheckIcon } from "@/components/icons";
import { createServerSupabase } from "@/lib/db/server";
import { signAudioPaths } from "@/lib/audio/storage";
import {
  bibleComUrl,
  formatEntryPassage,
  type ReadingPlan,
  type ReadingPlanEntry,
} from "@/lib/reading-plan";
import ArchiveAudioButton from "@/app/archive/_components/archive-audio-button";
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
};

type ProgressRow = { date: string; messages: LogRow | LogRow[] | null };

export default async function ReadingPlanPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: planRows }] = await Promise.all([
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

  const selectedId = profile?.reading_plan_id ?? null;
  const plans = (planRows ?? []) as PlanRow[];

  // Days of the selected plan, each paired with the log that completed it
  // (via reading_plan_progress).
  let entries: EntryRow[] = [];
  const logByDate = new Map<string, LogRow>();
  const doneDates = new Set<string>();
  let signedUrls: Record<string, string> = {};
  if (selectedId) {
    const [{ data: entryRows }, { data: progressRows }] = await Promise.all([
      supabase
        .from("reading_plan_entries")
        .select("date, begin_chapter, end_chapter")
        .eq("plan_id", selectedId)
        .order("date", { ascending: true }),
      supabase
        .from("reading_plan_progress")
        .select(
          "date, messages(id, reference, note, voice_path, transcript, created_at)",
        )
        .eq("user_id", user.id)
        .eq("plan_id", selectedId),
    ]);
    entries = (entryRows ?? []) as EntryRow[];
    for (const p of (progressRows ?? []) as ProgressRow[]) {
      doneDates.add(p.date);
      const log = Array.isArray(p.messages) ? p.messages[0] : p.messages;
      if (log) logByDate.set(p.date, log);
    }
    signedUrls = await signAudioPaths(
      supabase,
      [...logByDate.values()].map((l) => l.voice_path),
    );
  }

  return (
    <ProfileFrame
      tab="plan"
      name={profile?.display_name ?? "Unknown"}
      contentClassName="px-8"
    >
      <ProfileCookieSync id={user.id} name={profile?.display_name ?? null} />
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
          {entries.map((entry) => {
            const log = logByDate.get(entry.date) ?? null;
            return (
              <li key={entry.date}>
                <EntryCard
                  entry={entry}
                  log={log}
                  done={doneDates.has(entry.date)}
                  audioSrc={
                    log?.voice_path
                      ? (signedUrls[log.voice_path] ?? null)
                      : null
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </ProfileFrame>
  );
}

function EntryCard({
  entry,
  log,
  done,
  audioSrc,
}: {
  entry: EntryRow;
  log: LogRow | null;
  done: boolean;
  audioSrc: string | null;
}) {
  const dateLabel = new Date(`${entry.date}T00:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric" },
  );
  const passage = formatEntryPassage(entry);
  const href = bibleComUrl(entry);

  if (!log) {
    return (
      <div className="rounded-2xl bg-zinc-800/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-zinc-400 active:text-zinc-500"
              >
                {passage}
              </a>
            ) : (
              <span className="text-sm font-semibold text-zinc-400">
                {passage}
              </span>
            )}
            {done ? (
              <CheckIcon className="h-4 w-4 shrink-0 text-zinc-400" />
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-zinc-500">{dateLabel}</span>
        </div>
      </div>
    );
  }

  const body = log.transcript ?? log.note;
  return (
    <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-white">
      <div className="flex items-center gap-3">
        {audioSrc ? (
          <ArchiveAudioButton src={audioSrc} />
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
      className="flex flex-col gap-1 rounded-md py-2 text-left active:bg-zinc-800"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-lg text-zinc-100">{name}</span>
        </span>
        {selected ? (
          <CheckIcon className="h-5 w-5 shrink-0 text-zinc-100" />
        ) : null}
      </span>
      {selected && description ? (
        <span className="text-sm leading-snug text-zinc-400">{description}</span>
      ) : null}
    </button>
  );
}
