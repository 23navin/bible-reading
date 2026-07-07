import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell, Header, Body } from "@/components/shell";
import { CloseIcon } from "@/components/icons";
import { createServerSupabase } from "@/lib/db/server";
import { signOut } from "@/app/login/_actions/authenticate";
import { DisplayNameEditor } from "./_components/display-name-editor";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

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

      <Body className="flex flex-col gap-8 px-8 py-4">
        <section>
          <p className="text-lg text-zinc-100">
            display name is{" "}
            <DisplayNameEditor initialName={profile?.display_name ?? "Unknown"} />
          </p>
          {/* Auth emails are synthetic username@vercel.user addresses. */}
          <p className="text-sm text-zinc-500">
            login as <span className="text-zinc-300">{user.email?.split("@")[0]}</span>
          </p>
        </section>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-800 px-4 py-3 text-base font-semibold text-red-400 active:bg-zinc-700"
          >
            Log out
          </button>
        </form>
      </Body>
    </Shell>
  );
}
