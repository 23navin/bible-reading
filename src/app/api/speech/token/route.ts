import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth/api";

export const maxDuration = 15;

const MP_URL = "https://mp.speechmatics.com/v1/api_keys?type=rt";

export async function POST() {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Historical misspelling: the env var was created as SPEECHMATIC_API_KEY.
  // Prefer the corrected name; drop the fallback once Vercel env is renamed.
  const apiKey = process.env.SPEECHMATICS_API_KEY ?? process.env.SPEECHMATIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SPEECHMATICS_API_KEY not configured" },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch(MP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 300 }),
      // Without this the route can hang indefinitely when mp.speechmatics.com
      // is slow, which clients see as "Load failed" after their own timeout.
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to mint Speechmatics token", detail },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to mint Speechmatics token", detail },
      { status: 502 },
    );
  }

  const { key_value } = (await res.json()) as { key_value: string };
  return NextResponse.json({ token: key_value });
}
