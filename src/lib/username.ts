// Map usernames to synthetic emails for Supabase Auth.
// Disable "Confirm email" in Supabase Dashboard -> Authentication -> Providers -> Email.

const EMAIL_DOMAIN = "scriptureshare.local";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${EMAIL_DOMAIN}`;
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_.-]{2,32}$/.test(normalizeUsername(username));
}
