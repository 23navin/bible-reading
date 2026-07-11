import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth/api";
import { PARSE_PASSAGE_SYSTEM } from "./prompt";

export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TEXT_LENGTH = 10_000;

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { text } = (await request.json()) as { text?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ reference: null, book: null, chapter: null, verse_start: null, verse_end: null, matched_text: null });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "text too long" }, { status: 400 });
  }

  let result;
  try {
    result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: PARSE_PASSAGE_SYSTEM,
      messages: [{ role: "user", content: text }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("parse-passage anthropic call failed", { text, detail });
    return NextResponse.json(
      { reference: null, book: null, chapter: null, verse_start: null, verse_end: null, matched_text: null },
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
      { reference: null, book: null, chapter: null, verse_start: null, verse_end: null, matched_text: null },
      { status: 200 },
    );
  }
}
