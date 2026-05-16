import { NextResponse } from "next/server";

const MP_URL = "https://mp.speechmatics.com/v1/api_keys?type=rt";

export async function POST() {
  const apiKey = process.env.SPEECHMATIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SPEECHMATIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  const res = await fetch(MP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl: 300 }),
  });

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
