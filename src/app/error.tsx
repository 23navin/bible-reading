"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-base text-neutral-500">Something went wrong.</p>
      <button onClick={reset} className="text-sm font-medium text-blue-500">
        Try again
      </button>
    </main>
  );
}
