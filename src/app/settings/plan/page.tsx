import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell, Header, Body } from "@/components/shell";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { createServerSupabase } from "@/lib/db/server";
import type { ReadingPlan } from "@/lib/reading-plan";
import { setReadingPlan } from "../_actions/set-reading-plan";

export const dynamic = "force-dynamic";

type PlanRow = ReadingPlan & { reading_plan_entries: { count: number }[] };

export default async function ReadingPlanPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: planRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("reading_plan_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("reading_plans")
      .select("id, display_name, description, reading_plan_entries(count)")
      .order("display_name"),
  ]);

  const selectedId = profile?.reading_plan_id ?? null;
  const plans = (planRows ?? []) as PlanRow[];

  return (
    <Shell className="bg-zinc-900 text-zinc-100">
      <Header className="flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Reading plan
        </h1>
        <Link
          href="/archive"
          aria-label="Close reading plan"
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-zinc-800"
        >
          <CloseIcon className="h-6 w-6 text-zinc-300" />
        </Link>
      </Header>

      <Body className="px-8 py-4">
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
      </Body>
    </Shell>
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
          {detail ? (
            <span className="shrink-0 text-sm text-zinc-500">{detail}</span>
          ) : null}
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
