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

export type BibleBook = {
  name: string;
  chapters: number;
  usfm: string; // 3-letter USFM code, used for bible.com deep links
};

// Canonical Protestant canon — the single source of truth for book names,
// chapter counts, and USFM codes. Lowercased names must match
// reading_plan_entries.book_key (Postgres normalize_book), or logs won't
// count toward reading plans.
const BOOK = (name: string, chapters: number, usfm: string): BibleBook => ({
  name,
  chapters,
  usfm,
});

export const BIBLE_BOOKS: BibleBook[] = [
  BOOK("Genesis", 50, "GEN"), BOOK("Exodus", 40, "EXO"),
  BOOK("Leviticus", 27, "LEV"), BOOK("Numbers", 36, "NUM"),
  BOOK("Deuteronomy", 34, "DEU"), BOOK("Joshua", 24, "JOS"),
  BOOK("Judges", 21, "JDG"), BOOK("Ruth", 4, "RUT"),
  BOOK("1 Samuel", 31, "1SA"), BOOK("2 Samuel", 24, "2SA"),
  BOOK("1 Kings", 22, "1KI"), BOOK("2 Kings", 25, "2KI"),
  BOOK("1 Chronicles", 29, "1CH"), BOOK("2 Chronicles", 36, "2CH"),
  BOOK("Ezra", 10, "EZR"), BOOK("Nehemiah", 13, "NEH"),
  BOOK("Esther", 10, "EST"), BOOK("Job", 42, "JOB"),
  BOOK("Psalms", 150, "PSA"), BOOK("Proverbs", 31, "PRO"),
  BOOK("Ecclesiastes", 12, "ECC"), BOOK("Song of Solomon", 8, "SNG"),
  BOOK("Isaiah", 66, "ISA"), BOOK("Jeremiah", 52, "JER"),
  BOOK("Lamentations", 5, "LAM"), BOOK("Ezekiel", 48, "EZK"),
  BOOK("Daniel", 12, "DAN"), BOOK("Hosea", 14, "HOS"),
  BOOK("Joel", 3, "JOL"), BOOK("Amos", 9, "AMO"),
  BOOK("Obadiah", 1, "OBA"), BOOK("Jonah", 4, "JON"),
  BOOK("Micah", 7, "MIC"), BOOK("Nahum", 3, "NAM"),
  BOOK("Habakkuk", 3, "HAB"), BOOK("Zephaniah", 3, "ZEP"),
  BOOK("Haggai", 2, "HAG"), BOOK("Zechariah", 14, "ZEC"),
  BOOK("Malachi", 4, "MAL"),
  BOOK("Matthew", 28, "MAT"), BOOK("Mark", 16, "MRK"),
  BOOK("Luke", 24, "LUK"), BOOK("John", 21, "JHN"),
  BOOK("Acts", 28, "ACT"), BOOK("Romans", 16, "ROM"),
  BOOK("1 Corinthians", 16, "1CO"), BOOK("2 Corinthians", 13, "2CO"),
  BOOK("Galatians", 6, "GAL"), BOOK("Ephesians", 6, "EPH"),
  BOOK("Philippians", 4, "PHP"), BOOK("Colossians", 4, "COL"),
  BOOK("1 Thessalonians", 5, "1TH"), BOOK("2 Thessalonians", 3, "2TH"),
  BOOK("1 Timothy", 6, "1TI"), BOOK("2 Timothy", 4, "2TI"),
  BOOK("Titus", 3, "TIT"), BOOK("Philemon", 1, "PHM"),
  BOOK("Hebrews", 13, "HEB"), BOOK("James", 5, "JAS"),
  BOOK("1 Peter", 5, "1PE"), BOOK("2 Peter", 3, "2PE"),
  BOOK("1 John", 5, "1JN"), BOOK("2 John", 1, "2JN"),
  BOOK("3 John", 1, "3JN"), BOOK("Jude", 1, "JUD"),
  BOOK("Revelation", 22, "REV"),
];

const BOOK_ALIASES: Record<string, string> = {
  psalm: "psalms",
  "song of songs": "song of solomon",
};

// "1st cor" / "First Corinthians" / "I Cor." -> the canonical BibleBook.
// Unambiguous prefixes are accepted ("psa" -> Psalms); ambiguous ones
// ("jud" -> Judges or Jude) are not.
export function resolveBook(input: string): BibleBook | null {
  let key = input.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  key = key
    .replace(/^(?:1st|first|i)\s/, "1 ")
    .replace(/^(?:2nd|second|ii)\s/, "2 ")
    .replace(/^(?:3rd|third|iii)\s/, "3 ");
  key = BOOK_ALIASES[key] ?? key;
  if (!key) return null;
  const exact = BIBLE_BOOKS.find((b) => b.name.toLowerCase() === key);
  if (exact) return exact;
  const prefixed = BIBLE_BOOKS.filter((b) =>
    b.name.toLowerCase().startsWith(key),
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
  const { name: book, chapters: chapterCount } = resolved;
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

