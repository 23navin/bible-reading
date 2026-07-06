"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Avatar } from "@/components/avatar";
import {
  PROFILE_COOKIE,
  profileCookieOptions,
  parseProfileCookie,
  serializeProfileCookie,
  type ProfileCookie,
} from "@/lib/auth/profile-cookie";

function subscribe() {
  return () => {};
}

function readRawCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${PROFILE_COOKIE}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(PROFILE_COOKIE.length + 1));
  } catch {
    return null;
  }
}

// getSnapshot must return a referentially stable value while the cookie is
// unchanged (useSyncExternalStore compares with Object.is), so the parsed
// object is cached keyed by the raw cookie string.
let cachedRaw: string | null = null;
let cachedProfile: ProfileCookie | null = null;

function getSnapshot(): ProfileCookie | null {
  const raw = readRawCookie();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedProfile = parseProfileCookie(raw);
  }
  return cachedProfile;
}

function getServerSnapshot(): ProfileCookie | null {
  return null;
}

function useProfileCookie(): ProfileCookie | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Renders the cached display name from document.cookie, or the fallback
// (e.g. a skeleton) until hydration / when the cookie is absent. Lets
// loading.tsx show the real name before the server has sent anything.
export function CookieDisplayName({ fallback }: { fallback?: React.ReactNode }) {
  const profile = useProfileCookie();
  return profile ? <>{profile.name}</> : <>{fallback}</>;
}

// Same idea for the avatar: it is a pure function of (name, id), so the
// cookie is enough to render the real thing.
export function CookieAvatar({
  size,
  fallback,
}: {
  size: number;
  fallback?: React.ReactNode;
}) {
  const profile = useProfileCookie();
  return profile ? (
    <Avatar name={profile.name} id={profile.id} size={size} />
  ) : (
    <>{fallback}</>
  );
}

// Keeps the cookie in sync with the database value once a page has fetched
// it — this is what backfills sessions that predate the cookie (login sets
// it for new sessions). Renders nothing.
export function ProfileCookieSync({ id, name }: { id: string; name: string | null }) {
  useEffect(() => {
    if (!name) return;
    const current = getSnapshot();
    if (current && current.id === id && current.name === name) return;
    const { sameSite, secure, path, maxAge } = profileCookieOptions;
    document.cookie =
      `${PROFILE_COOKIE}=${encodeURIComponent(serializeProfileCookie({ id, name }))}; ` +
      `path=${path}; max-age=${maxAge}; samesite=${sameSite}` +
      (secure ? "; secure" : "");
  }, [id, name]);
  return null;
}
