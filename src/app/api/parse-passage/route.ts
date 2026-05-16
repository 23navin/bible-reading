import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { PARSE_PASSAGE_SYSTEM } from "./prompt";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ reference: null, book: null, chapter: null, verse_start: null, verse_end: null });
  }

  let result;
  try {
    result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: PARSE_PASSAGE_SYSTEM,
      messages: [{ role: "user", content: text }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("parse-passage anthropic call failed", { text, detail });
    return NextResponse.json(
      { reference: null, book: null, chapter: null, verse_start: null, verse_end: null },
      { status: 200 },
    );
  }

  const block = result.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";
  // Haiku sometimes wraps JSON in ```json … ``` fences despite the system prompt.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    if (!parsed.reference) {
      console.warn("parse-passage no reference", { text, raw });
    }
    return NextResponse.json(parsed);
  } catch {
    console.warn("parse-passage bad JSON", { text, raw });
    return NextResponse.json(
      { reference: null, book: null, chapter: null, verse_start: null, verse_end: null },
      { status: 200 },
    );
  }
}
