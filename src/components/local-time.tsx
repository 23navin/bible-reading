"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// True only after hydration. Timezone-dependent formatting must wait for this:
// the server renders in the server's timezone, so anything derived from the
// viewer's local time has to be withheld until the client takes over.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type Props = {
  iso: string;
  options: Intl.DateTimeFormatOptions;
  // IANA zone the timestamp was created in. When set, the time is shown as the
  // author experienced it rather than converted to the viewer's timezone.
  timeZone?: string | null;
  className?: string;
};

function format(iso: string, options: Intl.DateTimeFormatOptions, timeZone?: string | null) {
  const date = new Date(iso);
  if (timeZone) {
    try {
      return date.toLocaleString([], { ...options, timeZone });
    } catch {
      // Unrecognized zone name — fall through to the viewer's timezone.
    }
  }
  return date.toLocaleString([], options);
}

export default function LocalTime({ iso, options, timeZone, className }: Props) {
  // Even with an explicit timeZone, formatting waits for hydration because the
  // locale (undefined = environment default) still differs between server and
  // browser.
  const hydrated = useHydrated();
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {hydrated ? format(iso, options, timeZone) : null}
    </time>
  );
}
