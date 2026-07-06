export type ParsedPassage = {
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  reference: string | null;
  matched_text: string | null;
};

export function applyReferenceReplacement(
  text: string,
  passage: ParsedPassage | null,
): string {
  if (!text || !passage?.reference || !passage.matched_text) return text;
  // Refuse to replace any span that crosses a sentence boundary — collapsing
  // "Matthew 4 today. Specifically verse 6" into "Matthew 4:6" would change
  // the meaning of the transcript. The prompt forbids this, but guard anyway.
  if (/[.?!]\s/.test(passage.matched_text)) return text;
  if (!text.includes(passage.matched_text)) return text;
  return text.replace(passage.matched_text, passage.reference);
}

