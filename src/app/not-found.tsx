import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-base text-neutral-500">Page not found.</p>
      <Link href="/" className="text-sm font-medium text-blue-500">
        Back home
      </Link>
    </main>
  );
}
