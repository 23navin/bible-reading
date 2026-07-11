import { CookieAvatar, CookieDisplayName } from "@/components/profile-cookie";
import { KeyboardIcon } from "@/components/icons";
import { Shell, Header, Body, Footer } from "@/components/shell";

// Mirrors HomeView's idle frame so the streamed page swaps in without a
// layout shift. The name and avatar render for real from the profile cookie;
// everything else is a placeholder with the same geometry as the content
// that replaces it. Controls are non-interactive.
export default function HomeLoading() {
  const rows = [
    { name: "w-28", time: "w-12" },
    { name: "w-36", time: "w-16" },
    { name: "w-24", time: "w-12" },
  ];

  return (
    <Shell className="bg-neutral-900 text-neutral-100">
      <Header className="relative flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-white">
            <CookieDisplayName
              fallback={
                <span
                  aria-hidden
                  className="inline-block h-[1em] w-24 translate-y-[0.08em] animate-pulse rounded-md bg-neutral-700"
                />
              }
            />
          </span>
          &apos;s reading log
        </h1>
        <span
          style={{ borderRadius: 8 }}
          className="block ring-1 ring-neutral-700"
        >
          <CookieAvatar
            size={40}
            fallback={
              <span
                aria-hidden
                style={{ borderRadius: 8 }}
                className="block h-10 w-10 animate-pulse bg-neutral-800"
              />
            }
          />
        </span>
      </Header>

      <Body className="px-8">
        <ul className="flex flex-col gap-1 py-4">
          {rows.map((row, i) => (
            <li
              key={i}
              aria-hidden
              className="flex animate-pulse items-center gap-3 py-2"
            >
              {/* text-lg row: 20px bar centered in the 28px line box */}
              <span className={`my-1 h-5 rounded bg-neutral-700 ${row.name}`} />
              {/* AvatarStack: 28px tiles, 8px radius, -10px overlap */}
              <span className="ml-1 flex items-center">
                <span className="z-[1] h-7 w-7 rounded-lg bg-neutral-700 ring-2 ring-neutral-900" />
                <span className="-ml-2.5 h-7 w-7 rounded-lg bg-neutral-600 ring-2 ring-neutral-900" />
              </span>
              {/* text-sm timestamp on the right */}
              <span
                className={`ml-auto h-3.5 shrink-0 rounded bg-neutral-700/60 ${row.time}`}
              />
            </li>
          ))}
        </ul>
      </Body>

      <Footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <p aria-hidden className="mb-2 text-center text-sm tabular-nums text-neutral-400">
          {" "}
        </p>
        <div className="flex">
          <div
            aria-hidden
            className="flex h-20 min-w-0 flex-1 items-center justify-center rounded-md border border-red-500 bg-transparent"
          >
            <span className="block h-8 w-8 rounded-full bg-red-500" />
          </div>
          <div
            aria-hidden
            className="ml-3 flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-neutral-400 bg-transparent text-neutral-300"
          >
            <KeyboardIcon className="h-7 w-7 shrink-0" />
          </div>
        </div>
      </Footer>
    </Shell>
  );
}
