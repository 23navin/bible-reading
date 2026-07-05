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

export function stripLeadingReference(
  text: string,
  reference: string | null,
): string {
  if (!text || !reference) return text;
  const trimmed = text.trimStart();
  if (!trimmed.toLowerCase().startsWith(reference.toLowerCase())) return text;
  const rest = trimmed.slice(reference.length);
  const sep = rest.match(/^[\s.,:;!?—–-]+/);
  if (!sep) return text;
  const body = rest.slice(sep[0].length);
  // Only strip when what follows reads as a new sentence — a lowercase
  // continuation ("Lamentations 3, which is about...") means the reference
  // is part of the sentence and must stay.
  if (!body || !/^[A-Z"'“(\[]/.test(body)) return text;
  return body;
}

export function passageSpecificity(p: ParsedPassage | null): number {
  if (!p?.reference) return 0;
  if (p.verse_end != null) return 4;
  if (p.verse_start != null) return 3;
  if (p.chapter != null) return 2;
  if (p.book != null) return 1;
  return 0;
}
