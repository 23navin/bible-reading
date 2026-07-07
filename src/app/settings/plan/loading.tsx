import Link from "next/link";
import { Shell, Header, Body } from "@/components/shell";
import { CloseIcon } from "@/components/icons";

export default function Loading() {
  return (
    <Shell className="bg-zinc-900 text-zinc-100">
      <Header className="flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          reading plan
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
        <div className="flex animate-pulse flex-col gap-1">
          {[16, 40, 32, 36].map((width, i) => (
            <div key={i} className="flex items-center py-2">
              <div
                className="h-7 rounded bg-zinc-800"
                style={{ width: `${width}%` }}
              />
            </div>
          ))}
        </div>

        <ul className="-mx-4 mt-8 flex animate-pulse flex-col gap-3 pb-8">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="rounded-2xl bg-zinc-800/40 px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="h-5 w-24 rounded bg-zinc-800" />
                <div className="h-4 w-12 rounded bg-zinc-800" />
              </div>
            </li>
          ))}
        </ul>
      </Body>
    </Shell>
  );
}
