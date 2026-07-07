import Link from "next/link";
import { Shell, Header, Body } from "@/components/shell";
import { CloseIcon } from "@/components/icons";

export default function Loading() {
  return (
    <Shell className="bg-zinc-900 text-zinc-100">
      <Header className="flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          manage account
        </h1>
        <Link
          href="/archive"
          aria-label="Close account"
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-zinc-800"
        >
          <CloseIcon className="h-6 w-6 text-zinc-300" />
        </Link>
      </Header>

      <Body className="flex animate-pulse flex-col gap-8 px-8 py-4">
        <section className="flex flex-col gap-2">
          <div className="h-7 w-3/5 rounded bg-zinc-800" />
          <div className="h-5 w-2/5 rounded bg-zinc-800" />
        </section>

        <div className="h-12 w-full rounded-md bg-zinc-800" />
      </Body>
    </Shell>
  );
}
