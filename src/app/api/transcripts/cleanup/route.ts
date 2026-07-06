import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CLEANUP_TRANSCRIPT_SYSTEM } from "./prompt";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NULL_PASSAGE = {
  book: null,
  chapter: null,
  verse_start: null,
  verse_end: null,
  reference: null,
};

export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ text: text ?? "", ...NULL_PASSAGE });
  }

  let result;
  try {
    result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: CLEANUP_TRANSCRIPT_SYSTEM,
      messages: [{ role: "user", content: text }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("cleanup-transcript anthropic call failed", { detail });
    return NextResponse.json({ text, ...NULL_PASSAGE });
  }

  const block = result.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";
  // Haiku sometimes wraps JSON in ```json … ``` fences despite the system prompt.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: {
    text?: unknown;
    book?: unknown;
    chapter?: unknown;
    verse_start?: unknown;
    verse_end?: unknown;
    reference?: unknown;
  };
  try {
    parsed = JSON.parse(stripped);
  } catch {
    console.warn("cleanup-transcript bad JSON", { raw });
    return NextResponse.json({ text, ...NULL_PASSAGE });
  }

  const passage = {
    book: typeof parsed.book === "string" ? parsed.book : null,
    chapter: typeof parsed.chapter === "number" ? parsed.chapter : null,
    verse_start: typeof parsed.verse_start === "number" ? parsed.verse_start : null,
    verse_end: typeof parsed.verse_end === "number" ? parsed.verse_end : null,
    reference: typeof parsed.reference === "string" ? parsed.reference : null,
  };

  const cleaned = typeof parsed.text === "string" ? parsed.text.trim() : "";
  // Cleanup should trim noise, not summarize. If the output is drastically
  // shorter than the input (beyond removing a leading reference), assume the
  // model dropped meaning and keep the original text — but keep the parsed
  // reference, which is independently useful.
  const expectedMin =
    Math.max(0, text.trim().length - (passage.reference?.length ?? 0) - 8) * 0.35;
  if (!cleaned || cleaned.length < expectedMin) {
    console.warn("cleanup-transcript suspicious output", {
      inLen: text.length,
      outLen: cleaned.length,
    });
    return NextResponse.json({ text, ...passage });
  }

  return NextResponse.json({ text: cleaned, ...passage });
}
