import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CLEANUP_TRANSCRIPT_SYSTEM } from "./prompt";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { text, reference } = (await request.json()) as {
    text?: string;
    reference?: string | null;
  };
  if (!text || !text.trim()) {
    return NextResponse.json({ text: text ?? "" });
  }

  const content = reference
    ? `Passage reference (already shown as a header above this log): ${reference}\n\nTranscript:\n${text}`
    : `Transcript:\n${text}`;

  let result;
  try {
    result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: CLEANUP_TRANSCRIPT_SYSTEM,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("cleanup-transcript anthropic call failed", { detail });
    return NextResponse.json({ text });
  }

  const block = result.content.find((b) => b.type === "text");
  const cleaned = block && block.type === "text" ? block.text.trim() : "";

  // Cleanup should trim noise, not summarize. If the output is drastically
  // shorter than the input (beyond removing a leading reference), assume the
  // model dropped meaning and fall back to the original.
  const expectedMin =
    Math.max(0, text.trim().length - (reference?.length ?? 0) - 8) * 0.35;
  if (!cleaned || cleaned.length < expectedMin) {
    console.warn("cleanup-transcript suspicious output", {
      inLen: text.length,
      outLen: cleaned.length,
    });
    return NextResponse.json({ text });
  }

  return NextResponse.json({ text: cleaned });
}
