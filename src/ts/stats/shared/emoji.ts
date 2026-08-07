/**
 * Force emoji (colour) presentation. Telegram sends reaction emoticons as
 * bare code points — "❤" — and code points below the emoji blocks
 * default to *text* presentation, so a heart renders as a black glyph
 * instead of a red one. Appending U+FE0F asks for the emoji rendering.
 *
 * Only single code points are touched: sequences (flags, skin tones, ZWJ
 * families) already carry their own presentation and must not be altered.
 */
const EMOJI_PRESENTATION_SELECTOR = "️";
/** Above this, code points already default to emoji presentation. */
const EMOJI_BLOCK_START = 0x1f000;

export function withEmojiPresentation(emoji: string): string {
  if (emoji.includes(EMOJI_PRESENTATION_SELECTOR)) return emoji;
  const points = [...emoji];
  if (points.length !== 1) return emoji;
  const code = points[0].codePointAt(0) ?? 0;
  return code < EMOJI_BLOCK_START ? emoji + EMOJI_PRESENTATION_SELECTOR : emoji;
}
