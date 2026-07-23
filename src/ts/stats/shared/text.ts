/**
 * Text tokenization shared by word/emoji frequency and any other module that
 * needs to break message text into words and emoji. Pure and locale-stable.
 */

// Small English stopword set — enough to keep "the/and/you" out of top-words
// without pretending to be a full NLP stoplist.
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "as",
  "by",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "my",
  "your",
  "so",
  "no",
  "not",
  "do",
  "did",
  "does",
  "have",
  "has",
  "had",
]);

const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
// A single emoji can span many code points: keycaps (3️⃣), flags (two regional
// indicators), and pictographs with variation selectors (U+FE0F), skin-tone
// modifiers, and ZWJ (U+200D) joins (👍🏽, 👨‍👩‍👧, ❤️‍🔥). Match whole sequences
// so they don't split apart.
const EMOJI_RE =
  /[#*0-9]\uFE0F\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/gu;
// Glyphs like ™ and © are Extended_Pictographic but render as text unless
// followed by VS16 — only count sequences that display as emoji.
const EMOJI_PRESENTATION_RE = /\p{Emoji_Presentation}|\uFE0F/u;
// Words: unicode letters/numbers plus internal apostrophes ("don't").
const WORD_RE = /[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu;

const MIN_WORD_LENGTH = 2;

export interface Tokens {
  words: string[]; // lowercased, stopwords and 1-char tokens removed
  emoji: string[]; // individual emoji pictographs, in order
}

export function tokenize(text: string): Tokens {
  if (!text) return { words: [], emoji: [] };

  const emoji = (text.match(EMOJI_RE) ?? []).filter((glyph) =>
    EMOJI_PRESENTATION_RE.test(glyph),
  );

  const withoutUrls = text.replace(URL_RE, " ");
  const rawWords = withoutUrls.toLowerCase().match(WORD_RE) ?? [];
  const words = rawWords.filter(
    (w) => w.length >= MIN_WORD_LENGTH && !STOPWORDS.has(w),
  );

  return { words, emoji };
}
