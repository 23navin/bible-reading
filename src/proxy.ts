import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/cron/* authenticates itself via CRON_SECRET (no Supabase cookie on
// Vercel cron invocations), so it must bypass the session gate here.
const PUBLIC_PATHS = ["/login", "/auth", "/api/cron"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() verifies the JWT locally against the cached JWKS (no auth
  // server round trip). It refreshes the session only when the access token
  // has expired — refreshed cookies flow out through setAll above. Do not
  // replace this with getUser(), which hits the auth server on every request.
  const { data } = await supabase.auth.getClaims();
  const authed = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!authed && !isPublic) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (authed && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Carry along any cookies refreshed during getClaims().
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
