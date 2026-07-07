// Cached copy of the viewer's profile (id + display name + reading plan) so
// page headers can render the name and avatar without a database round trip —
// Avatar is derived entirely from id + name — and /plan can start fetching the
// selected plan's entries before the profiles row arrives. Set on login and
// cleared on logout by the auth actions; sessions that predate it are
// backfilled client-side (ProfileCookieSync). Display/prefetch data only —
// the profiles row stays authoritative — so it is deliberately not httpOnly:
// loading skeletons read it from document.cookie to show the real header
// before the server responds.
export const PROFILE_COOKIE = "profile";

// planId: string = selected plan, null = no plan, undefined = not yet known
// (cookie written before planId existed, or by code that doesn't know it).
export type ProfileCookie = { id: string; name: string; planId?: string | null };

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
    const parsed = JSON.parse(raw) as { id?: unknown; name?: unknown; planId?: unknown };
    if (typeof parsed.id === "string" && parsed.id && typeof parsed.name === "string" && parsed.name) {
      const profile: ProfileCookie = { id: parsed.id, name: parsed.name };
      if (typeof parsed.planId === "string" || parsed.planId === null) {
        profile.planId = parsed.planId;
      }
      return profile;
    }
  } catch {
    // Malformed cookie — treat as absent.
  }
  return null;
}
