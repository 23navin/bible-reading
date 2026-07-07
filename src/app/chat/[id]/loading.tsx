import Link from "next/link";
import { Shell, Header, Body, Footer } from "@/components/shell";

// Mirrors ChatView's frame so the streamed page swaps in without a layout
// shift. The back link is real so a slow load can be abandoned.
export default function ChatLoading() {
  return (
    <Shell>
      <Header className="flex items-center bg-neutral-900 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          href="/"
          aria-label="Home"
          className="-m-2 flex h-10 w-10 items-center justify-center text-neutral-300 active:text-neutral-100"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <div className="flex flex-1 items-center justify-center gap-2">
          <span aria-hidden className="h-4 w-28 animate-pulse rounded bg-neutral-700" />
        </div>
        <span aria-hidden className="h-10 w-10" />
      </Header>

      <Body className="px-3 py-4">
        <div aria-hidden className="flex animate-pulse flex-col gap-3">
          {/* date divider */}
          <div className="flex justify-center py-1">
            <span className="my-[3px] h-3.5 w-20 rounded bg-neutral-800" />
          </div>
          <BubbleSkeleton mine={false} width="w-3/5" lines={2} />
          <BubbleSkeleton mine width="w-2/5" lines={0} />
          <BubbleSkeleton mine={false} width="w-3/4" lines={3} />
          <BubbleSkeleton mine width="w-1/2" lines={1} />
        </div>
      </Body>

      <Footer>
        <div className="px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div aria-hidden className="flex items-end gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200">
              <span className="block h-5 w-5 rounded-full bg-red-500" />
            </span>
            <span className="h-10 min-h-[40px] flex-1 rounded-2xl border border-neutral-200 bg-neutral-50" />
            <span className="h-10 w-10 shrink-0 rounded-full bg-blue-500 opacity-40" />
          </div>
        </div>
      </Footer>
    </Shell>
  );
}

// Mirrors MessageBubble: author/time meta line, then a rounded-2xl bubble
// with the reference row (audio circle + title) and optional body lines.
function BubbleSkeleton({
  mine,
  width,
  lines,
}: {
  mine: boolean;
  width: string;
  lines: number;
}) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`mb-0.5 flex items-baseline gap-1 px-4 ${mine ? "flex-row-reverse" : ""}`}
      >
        {!mine ? <span className="my-[3px] h-3.5 w-16 rounded bg-neutral-800" /> : null}
        <span className="my-[3px] h-3 w-10 rounded bg-neutral-800/70" />
      </div>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${width} ${
          mine ? "bg-blue-500/25" : "bg-neutral-200/15"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="h-8 w-8 shrink-0 rounded-full bg-white/20" />
          <span className="my-[3px] h-3.5 w-24 rounded bg-white/25" />
        </div>
        {lines > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {Array.from({ length: lines }).map((_, i) => (
              <span
                key={i}
                className={`h-3.5 rounded bg-white/20 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M15 18L9 12l6-6" />
    </svg>
  );
}
