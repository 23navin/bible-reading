// Reading plans live in the database (reading_plans / reading_plan_entries),
// seeded from the JSON files in src/data/reading-plans/ — see the README
// there (`npm run seed:plans`). The user's selected plan is
// profiles.reading_plan_id.

import { parseReferenceInput } from "./passage";

export type ReadingPlan = {
  id: string;
  display_name: string;
  description: string | null;
};

export type ReadingPlanEntry = {
  plan_id: string;
  date: string; // ISO date (yyyy-mm-dd)
  begin_chapter: string;
  end_chapter: string;
  description: string | null;
};

// What the home page shows: the next plan entry the user hasn't read.
export type NextReading = {
  date: string; // ISO date (yyyy-mm-dd)
  passage: string;
  href: string | null;
};

type ParsedRef = { book: string; chapter: number | null; verse: number | null };

// "1 Samuel 16:7" -> { book: "1 Samuel", chapter: 16, verse: 7 };
// "Jude" (single-chapter book) -> { book: "Jude", chapter: null, verse: null }.
export function parseReference(ref: string): ParsedRef {
  const m = ref.trim().match(/^(.*?)\s+(\d+)(?::(\d+))?$/);
  if (!m) return { book: ref.trim(), chapter: null, verse: null };
  return { book: m[1], chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : null };
}

// "John 1:1" + "John 1:18" -> "John 1:1-18"; "Genesis 1" + "Genesis 1" -> "Genesis 1".
export function formatEntryPassage(entry: Pick<ReadingPlanEntry, "begin_chapter" | "end_chapter">): string {
  const { begin_chapter: begin, end_chapter: end } = entry;
  if (begin === end) return begin;
  const b = parseReference(begin);
  const e = parseReference(end);
  if (b.book === e.book && b.chapter != null && e.chapter != null) {
    if (b.chapter === e.chapter && e.verse != null) return `${begin}-${e.verse}`;
    return `${begin}-${e.chapter}${e.verse != null ? `:${e.verse}` : ""}`;
  }
  return `${begin} - ${end}`;
}

// Translations users can pick (profiles.bible_translation, constrained by a
// database check) mapped to bible.com version ids.
export const BIBLE_TRANSLATIONS = ["ESV", "NASB", "NIV", "NKJV", "NLT"] as const;
export type BibleTranslation = (typeof BIBLE_TRANSLATIONS)[number];

const BIBLE_COM_VERSION_IDS: Record<BibleTranslation, number> = {
  ESV: 59,
  NASB: 2692,
  NIV: 111,
  NKJV: 114,
  NLT: 116,
};

export const DEFAULT_TRANSLATION: BibleTranslation = "ESV";

export function isBibleTranslation(value: unknown): value is BibleTranslation {
  return BIBLE_TRANSLATIONS.includes(value as BibleTranslation);
}

// Unknown/missing translations (e.g. a viewer whose profile hasn't loaded)
// fall back to the default rather than producing a broken link.
function bibleComVersionId(translation: string | null | undefined): number {
  return BIBLE_COM_VERSION_IDS[
    isBibleTranslation(translation) ? translation : DEFAULT_TRANSLATION
  ];
}

// bible.com chapter URL for an entry, e.g. https://www.bible.com/bible/59/JHN.1
// (59 = ESV). Same-chapter verse ranges become JHN.1.1-18.
export function bibleComUrl(
  entry: Pick<ReadingPlanEntry, "begin_chapter" | "end_chapter">,
  translation?: string | null,
): string | null {
  const b = parseReference(entry.begin_chapter);
  const e = parseReference(entry.end_chapter);
  const code = USFM_BOOK_CODES[normalizeBook(b.book)];
  if (!code) return null;
  const chapter = b.chapter ?? 1; // single-chapter books like Jude
  let ref = `${code}.${chapter}`;
  if (b.verse != null) {
    ref += `.${b.verse}`;
    if (e.verse != null && e.chapter === b.chapter && e.verse > b.verse) {
      ref += `-${e.verse}`;
    }
  }
  return `https://www.bible.com/bible/${bibleComVersionId(translation)}/${ref}`;
}

// bible.com URL for a stored log reference ("John 3:16-18", "Genesis 1-2",
// "Jude 5"). Whole books and chapter ranges link to their first chapter.
// Returns null for anything parseReferenceInput can't recognize.
export function bibleComUrlForReference(
  reference: string,
  translation?: string | null,
): string | null {
  const checked = parseReferenceInput(reference);
  if (!checked.ok) return null;
  const p = checked.passage;
  if (!p.book) return null;
  const code = USFM_BOOK_CODES[normalizeBook(p.book)];
  if (!code) return null;
  let ref = `${code}.${p.chapter ?? 1}`;
  if (p.verse_start != null) {
    ref += `.${p.verse_start}`;
    if (p.verse_end != null) ref += `-${p.verse_end}`;
  }
  return `https://www.bible.com/bible/${bibleComVersionId(translation)}/${ref}`;
}

function normalizeBook(book: string): string {
  const key = book.toLowerCase().replace(/\s+/g, " ").trim();
  return key === "psalm" ? "psalms" : key === "song of songs" ? "song of solomon" : key;
}

const USFM_BOOK_CODES: Record<string, string> = {
  genesis: "GEN", exodus: "EXO", leviticus: "LEV", numbers: "NUM",
  deuteronomy: "DEU", joshua: "JOS", judges: "JDG", ruth: "RUT",
  "1 samuel": "1SA", "2 samuel": "2SA", "1 kings": "1KI", "2 kings": "2KI",
  "1 chronicles": "1CH", "2 chronicles": "2CH", ezra: "EZR", nehemiah: "NEH",
  esther: "EST", job: "JOB", psalms: "PSA", proverbs: "PRO",
  ecclesiastes: "ECC", "song of solomon": "SNG", isaiah: "ISA",
  jeremiah: "JER", lamentations: "LAM", ezekiel: "EZK", daniel: "DAN",
  hosea: "HOS", joel: "JOL", amos: "AMO", obadiah: "OBA", jonah: "JON",
  micah: "MIC", nahum: "NAM", habakkuk: "HAB", zephaniah: "ZEP",
  haggai: "HAG", zechariah: "ZEC", malachi: "MAL",
  matthew: "MAT", mark: "MRK", luke: "LUK", john: "JHN", acts: "ACT",
  romans: "ROM", "1 corinthians": "1CO", "2 corinthians": "2CO",
  galatians: "GAL", ephesians: "EPH", philippians: "PHP",
  colossians: "COL", "1 thessalonians": "1TH", "2 thessalonians": "2TH",
  "1 timothy": "1TI", "2 timothy": "2TI", titus: "TIT", philemon: "PHM",
  hebrews: "HEB", james: "JAS", "1 peter": "1PE", "2 peter": "2PE",
  "1 john": "1JN", "2 john": "2JN", "3 john": "3JN", jude: "JUD",
  revelation: "REV",
};

// Progress lives in reading_plan_progress: one row per completed plan day,
// optionally linked to the message that completed it. Rows are written by a
// database trigger on messages (record_reading_plan_progress), which marks
// the earliest unread day of the author's plan whose passage matches the new
// log. The next reading is simply the earliest entry without a progress row.
