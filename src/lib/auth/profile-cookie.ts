// Cached copy of the viewer's profile (id + display name) so page headers can
// render the name and avatar without a database round trip — Avatar is
// derived entirely from these two fields. Set on login and cleared on logout
// by the auth actions; sessions that predate it are backfilled client-side
// (ProfileCookieSync). Display-only data, so it is deliberately not httpOnly:
// loading skeletons read it from document.cookie to show the real header
// before the server responds.
export const PROFILE_COOKIE = "profile";

export type ProfileCookie = { id: string; name: string };

export const profileCookieOptions = {
  httpOnly: false,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;

export function serializeProfileCookie(profile: ProfileCookie): string {
  return JSON.stringify(profile);
}

export function parseProfileCookie(raw: string | null | undefined): ProfileCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; name?: unknown };
    if (typeof parsed.id === "string" && parsed.id && typeof parsed.name === "string" && parsed.name) {
      return { id: parsed.id, name: parsed.name };
    }
  } catch {
    // Malformed cookie — treat as absent.
  }
  return null;
}
