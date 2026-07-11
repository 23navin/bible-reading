import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth/api";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Whisper's own hard limit. A 32 kbps memo is ~2.4 MB per 10 minutes, so
// legitimate uploads never get near this — it only stops abuse.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    return NextResponse.json({ text: result.text });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("transcribe failed", detail);
    return NextResponse.json(
      { error: "transcribe failed", detail },
      { status: 502 },
    );
  }
}
