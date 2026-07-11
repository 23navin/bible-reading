import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Supabase free-tier projects pause after ~7 days without activity. Vercel
// invokes this daily (see vercel.json) with Authorization: Bearer CRON_SECRET.
// The proxy exempts /api/cron from the session gate — this header check is
// the route's own auth.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Plain client, no cookies: any PostgREST query counts as project activity
  // even if RLS returns zero rows.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await supabase.from("reading_plans").select("id").limit(1);
  return NextResponse.json({ ok: !error }, { status: error ? 502 : 200 });
}
