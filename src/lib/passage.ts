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

// Canonical Protestant canon with chapter counts, for validating typed
// references. Lowercased names must match reading_plan_entries.book_key
// (Postgres normalize_book), or logs won't count toward reading plans.
const BIBLE_BOOKS: [name: string, chapters: number][] = [
  ["Genesis", 50], ["Exodus", 40], ["Leviticus", 27], ["Numbers", 36],
  ["Deuteronomy", 34], ["Joshua", 24], ["Judges", 21], ["Ruth", 4],
  ["1 Samuel", 31], ["2 Samuel", 24], ["1 Kings", 22], ["2 Kings", 25],
  ["1 Chronicles", 29], ["2 Chronicles", 36], ["Ezra", 10], ["Nehemiah", 13],
  ["Esther", 10], ["Job", 42], ["Psalms", 150], ["Proverbs", 31],
  ["Ecclesiastes", 12], ["Song of Solomon", 8], ["Isaiah", 66],
  ["Jeremiah", 52], ["Lamentations", 5], ["Ezekiel", 48], ["Daniel", 12],
  ["Hosea", 14], ["Joel", 3], ["Amos", 9], ["Obadiah", 1], ["Jonah", 4],
  ["Micah", 7], ["Nahum", 3], ["Habakkuk", 3], ["Zephaniah", 3],
  ["Haggai", 2], ["Zechariah", 14], ["Malachi", 4],
  ["Matthew", 28], ["Mark", 16], ["Luke", 24], ["John", 21], ["Acts", 28],
  ["Romans", 16], ["1 Corinthians", 16], ["2 Corinthians", 13],
  ["Galatians", 6], ["Ephesians", 6], ["Philippians", 4], ["Colossians", 4],
  ["1 Thessalonians", 5], ["2 Thessalonians", 3], ["1 Timothy", 6],
  ["2 Timothy", 4], ["Titus", 3], ["Philemon", 1], ["Hebrews", 13],
  ["James", 5], ["1 Peter", 5], ["2 Peter", 3], ["1 John", 5],
  ["2 John", 1], ["3 John", 1], ["Jude", 1], ["Revelation", 22],
];

const BOOK_ALIASES: Record<string, string> = {
  psalm: "psalms",
  "song of songs": "song of solomon",
};

// "1st cor" / "First Corinthians" / "I Cor." -> the canonical [name, chapters]
// entry. Unambiguous prefixes are accepted ("psa" -> Psalms); ambiguous ones
// ("jud" -> Judges or Jude) are not.
function resolveBook(input: string): [string, number] | null {
  let key = input.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  key = key
    .replace(/^(?:1st|first|i)\s/, "1 ")
    .replace(/^(?:2nd|second|ii)\s/, "2 ")
    .replace(/^(?:3rd|third|iii)\s/, "3 ");
  key = BOOK_ALIASES[key] ?? key;
  if (!key) return null;
  const exact = BIBLE_BOOKS.find(([name]) => name.toLowerCase() === key);
  if (exact) return exact;
  const prefixed = BIBLE_BOOKS.filter(([name]) =>
    name.toLowerCase().startsWith(key),
  );
  return prefixed.length === 1 ? prefixed[0] : null;
}

export type ReferenceCheck =
  | { ok: true; passage: ParsedPassage }
  | { ok: false; error: string };

// Deterministic parse of a typed reference ("john 3:16-18", "1st cor 13",
// "Genesis 1-2", "jude 5"). Returns a normalized passage, or an error message
// to show the user. Single-chapter books follow the app convention of
// chapter: null with the number in verse_start ("Jude 5").
export function parseReferenceInput(input: string): ReferenceCheck {
  const raw = input.replace(/\s+/g, " ").trim();
  if (!raw) {
    return { ok: false, error: "Add a passage reference, e.g. John 3:16." };
  }

  const m = raw.match(
    /^(.*?)(?:\s+(\d+)(?:\s*:\s*(\d+))?(?:\s*[-–—]\s*(\d+))?)?$/,
  );
  const bookInput = m?.[1].trim() || raw;
  const resolved = resolveBook(bookInput);
  if (!resolved) {
    return {
      ok: false,
      error: `Couldn't recognize "${bookInput}" as a book of the Bible.`,
    };
  }
  const [book, chapterCount] = resolved;
  const n1 = m?.[2] ? Number(m[2]) : null; // number after the book
  const verse = m?.[3] ? Number(m[3]) : null; // number after ":"
  const n2 = m?.[4] ? Number(m[4]) : null; // number after "-"

  const passage = (
    p: Partial<ParsedPassage> & { reference: string },
  ): ReferenceCheck => ({
    ok: true,
    passage: {
      book,
      chapter: null,
      verse_start: null,
      verse_end: null,
      matched_text: null,
      ...p,
    },
  });

  if (n1 == null) return passage({ reference: book }); // whole book

  if (chapterCount === 1) {
    // "Jude 5", "Jude 5-7", "Jude 1:5" — the number is a verse.
    if (verse != null && n1 !== 1) {
      return { ok: false, error: `${book} has only one chapter.` };
    }
    const v1 = verse ?? n1;
    if (n2 != null && n2 <= v1) {
      return { ok: false, error: `Verse range ${v1}-${n2} doesn't make sense.` };
    }
    return passage({
      reference: `${book} ${v1}${n2 != null ? `-${n2}` : ""}`,
      verse_start: v1,
      verse_end: n2,
    });
  }

  if (n1 < 1 || n1 > chapterCount) {
    return { ok: false, error: `${book} has ${chapterCount} chapters.` };
  }
  if (verse == null && n2 != null) {
    // "Genesis 1-2" — a chapter range.
    if (n2 > chapterCount) {
      return { ok: false, error: `${book} has ${chapterCount} chapters.` };
    }
    if (n2 <= n1) {
      return {
        ok: false,
        error: `Chapter range ${n1}-${n2} doesn't make sense.`,
      };
    }
    return passage({ reference: `${book} ${n1}-${n2}`, chapter: n1 });
  }
  if (verse != null) {
    if (n2 != null && n2 <= verse) {
      return {
        ok: false,
        error: `Verse range ${verse}-${n2} doesn't make sense.`,
      };
    }
    return passage({
      reference: `${book} ${n1}:${verse}${n2 != null ? `-${n2}` : ""}`,
      chapter: n1,
      verse_start: verse,
      verse_end: n2,
    });
  }
  return passage({ reference: `${book} ${n1}`, chapter: n1 });
}

