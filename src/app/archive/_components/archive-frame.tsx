import Link from "next/link";
import { Shell, Header, Body } from "@/components/shell";
import { CloseIcon } from "@/components/icons";

// Shared page chrome so the real page and loading.tsx render identical
// frames — the Suspense swap only touches the name and the list.
export function ArchiveFrame({
  name,
  children,
}: {
  name: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Shell className="bg-zinc-900 text-zinc-100">
      <Header className="flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-white">{name}</span>&apos;s personal log
        </h1>
        <Link
          href="/"
          aria-label="Close archive"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-zinc-800"
        >
          <CloseIcon className="h-6 w-6 text-zinc-300" />
        </Link>
      </Header>

      <Body className="pb-4">
        <nav className="mb-3 flex items-center gap-6 px-8 py-2">
          <Link
            href="/settings/account"
            className="text-sm font-medium text-zinc-400 active:text-white"
          >
            adjust account
          </Link>
          <Link
            href="/settings/plan"
            className="text-sm font-medium text-zinc-400 active:text-white"
          >
            manage reading plan
          </Link>
        </nav>
        <div className="px-3">{children}</div>
      </Body>
    </Shell>
  );
}

export function NameSkeleton() {
  return (
    <span
      aria-hidden
      className="inline-block h-[1em] w-24 translate-y-[0.08em] animate-pulse rounded-md bg-zinc-700"
    />
  );
}

export function ArchiveListSkeleton() {
  // Each entry mirrors a real card: play/"t" circle + text-sm reference +
  // text-xs timestamp, then 1-2 body lines at text-[15px] leading-snug,
  // and on some cards a share chip.
  const cards = [
    {
      reference: "w-32",
      lines: ["w-full", "w-full", "w-5/6", "w-full", "w-full", "w-2/3"],
    },
    { reference: "w-24", lines: ["w-3/4"]},
    {
      reference: "w-36",
      lines: ["w-full", "w-5/6", "w-full", "w-full", "w-1/2"],
    },
    { reference: "w-28", lines: ["w-full", "w-5/6"]},
    {
      reference: "w-32",
      lines: ["w-full", "w-full", "w-3/4", "w-full", "w-full", "w-5/6"],
    },
    { reference: "w-24", lines: ["w-2/3"]},
  ];
  return (
    <ul aria-hidden className="flex animate-pulse flex-col gap-3">
      {cards.map((card, i) => (
        <li key={i}>
          <div className="rounded-2xl bg-zinc-800 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 shrink-0 rounded-full bg-white/20" />
              <div className="flex flex-1 items-center justify-between gap-3">
                <span className={`my-[3px] h-3.5 rounded bg-zinc-600 ${card.reference}`} />
                <span className="my-0.5 h-3 w-24 shrink-0 rounded bg-zinc-700" />
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {card.lines.map((width, j) => (
                <span key={j} className={`h-3.5 rounded bg-zinc-700 ${width}`} />
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
