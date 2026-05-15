import { authenticate } from "../auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold tracking-tight">
          ScriptureShare
        </h1>
        <p className="mb-8 text-center text-sm text-stone-500">
          Pick a username and password. New here? We&apos;ll make an account.
        </p>

        <form action={authenticate} className="space-y-3">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <input
            name="username"
            type="text"
            required
            autoComplete="username"
            placeholder="Username"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none focus:border-stone-400"
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none focus:border-stone-400"
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-500 px-4 py-3 text-base font-semibold text-white active:bg-blue-600"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
