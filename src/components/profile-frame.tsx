import Link from "next/link";
import { Shell, Header, Body } from "@/components/shell";
import { CloseIcon } from "@/components/icons";

const TABS = [
  { id: "log", href: "/archive", title: "personal log", label: "see personal log" },
  { id: "account", href: "/account", title: "account", label: "adjust account" },
  { id: "plan", href: "/plan", title: "reading plan", label: "manage reading plan" },
] as const;

export type ProfileTab = (typeof TABS)[number]["id"];

// Shared page chrome for the personal log, account, and reading plan pages
// so they read as three tabs of one page: same header shape ({name}'s …),
// and a nav bar linking to the other two tabs. Also used by each route's
// loading.tsx so the Suspense swap only touches the name and the content.
export function ProfileFrame({
  name,
  tab,
  contentClassName = "px-4",
  children,
}: {
  name: React.ReactNode;
  tab: ProfileTab;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const current = TABS.find((t) => t.id === tab)!;
  return (
    // Document flow (not the fixed viewport shell) so the logs scroll as a
    // normal page: iOS Safari lets them slide under its bottom URL bar.
    <Shell flow="document" className="bg-neutral-900 text-neutral-100">
      <Header className="flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-white">{name}</span>&apos;s {current.title}
        </h1>
        <Link
          href="/"
          aria-label={`Close ${current.title}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-neutral-800"
        >
          <CloseIcon className="h-6 w-6 text-neutral-300" />
        </Link>
      </Header>

      <Body flow="document" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <nav className="mb-7 flex items-center gap-6 px-8">
          {TABS.filter((t) => t.id !== tab).map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="text-sm font-medium text-neutral-400 active:text-white"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className={contentClassName}>{children}</div>
      </Body>
    </Shell>
  );
}

export function NameSkeleton() {
  return (
    <span
      aria-hidden
      className="inline-block h-[1em] w-24 translate-y-[0.08em] animate-pulse rounded-md bg-neutral-700"
    />
  );
}
