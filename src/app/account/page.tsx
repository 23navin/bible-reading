import { ProfileFrame } from "@/components/profile-frame";
import { ProfileCookieSync } from "@/components/profile-cookie";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/app/login/_actions/authenticate";
import { BIBLE_TRANSLATIONS, DEFAULT_TRANSLATION } from "@/lib/reading-plan";
import { DisplayNameEditor } from "./_components/display-name-editor";
import { setBibleTranslation } from "./_actions/set-bible-translation";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bible_translation")
    .eq("id", user.id)
    .maybeSingle();

  const translation = profile?.bible_translation ?? DEFAULT_TRANSLATION;

  return (
    <ProfileFrame
      tab="account"
      name={profile?.display_name ?? "Unknown"}
      contentClassName="flex flex-col gap-8 px-8"
    >
      <ProfileCookieSync id={user.id} name={profile?.display_name ?? null} />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <section>
        <p className="text-lg text-neutral-100">
          display name is{" "}
          <DisplayNameEditor initialName={profile?.display_name ?? "Unknown"} />
        </p>
        {/* Auth emails are synthetic username@vercel.user addresses. */}
        <p className="text-sm text-neutral-500">
          login as <span className="text-neutral-300">{user.email?.split("@")[0]}</span>
        </p>
      </section>

      <section>
        <p className="text-lg text-neutral-100">
          translation for passage links
        </p>
        <form action={setBibleTranslation} className="flex flex-wrap gap-3">
          {BIBLE_TRANSLATIONS.map((t) => (
            <button
              key={t}
              type="submit"
              name="translation"
              value={t}
              className={`text-sm font-semibold ${
                t === translation
                  ? "text-neutral-100"
                  : "text-neutral-400 active:bg-neutral-700"
              }`}
            >
              {t}
            </button>
          ))}
        </form>
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-800 px-4 py-3 text-base font-semibold text-red-400 active:bg-neutral-700"
        >
          Log out
        </button>
      </form>
    </ProfileFrame>
  );
}
