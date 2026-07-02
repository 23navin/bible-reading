import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
