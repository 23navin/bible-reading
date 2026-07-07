import { authenticate } from "./_actions/authenticate";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-5xl font-bold tracking-tight">
          Reading Log
        </h1>
        <p className="mb-2 text-center text-sm text-neutral-500">
          Log in or Create an Account
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
            className="w-full rounded-md bg-neutral-800 px-4 py-3 text-base outline-none focus:border-neutral-400"
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className="w-full rounded-md bg-neutral-800 px-4 py-3 text-base outline-none focus:border-neutral-400"
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-md bg-neutral-100 px-4 py-3 text-base font-semibold text-neutral-800 active:bg-neutral-300"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
