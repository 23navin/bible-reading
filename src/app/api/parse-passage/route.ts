import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You extract Bible passage references from informal text.
Return strict JSON: {"book": string|null, "chapter": number|null, "verse_start": number|null, "verse_end": number|null, "reference": string|null}
- "book" is the canonical full English book name (e.g. "Romans", "1 Corinthians").
- "reference" is the human-readable form, e.g. "Romans 8:1-11" or "John 3" if no verses.
- If no passage is mentioned, every field is null.
- Output JSON only, no prose.`;

export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ reference: null, book: null, chapter: null, verse_start: null, verse_end: null });
  }

  const result = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  });

  const block = result.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";
  // Haiku sometimes wraps JSON in ```json … ``` fences despite the system prompt.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { reference: null, book: null, chapter: null, verse_start: null, verse_end: null },
      { status: 200 },
    );
  }
}
