import { redirect } from "next/navigation";
import { ProfileFrame } from "@/components/profile-frame";
import { ProfileCookieSync } from "@/components/profile-cookie";
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
    <ProfileFrame
      tab="account"
      name={profile?.display_name ?? "Unknown"}
      contentClassName="flex flex-col gap-8 px-8"
    >
      <ProfileCookieSync id={user.id} name={profile?.display_name ?? null} />
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
    </ProfileFrame>
  );
}
