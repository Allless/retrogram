import { describe, expect, it } from "vitest";

import { tokenize } from "./text";

describe("tokenize", () => {
  it("lowercases words and drops stopwords and 1-char tokens", () => {
    const { words } = tokenize("The coffee is great");
    expect(words).toEqual(["coffee", "great"]);
  });

  it("extracts emoji separately from words", () => {
    const { words, emoji } = tokenize("great work 🎉🙏");
    expect(words).toEqual(["great", "work"]);
    expect(emoji).toEqual(["🎉", "🙏"]);
  });

  it("keeps multi-codepoint emoji sequences whole", () => {
    expect(tokenize("nice 👍🏽").emoji).toEqual(["👍🏽"]);
    expect(tokenize("family 👨‍👩‍👧").emoji).toEqual(["👨‍👩‍👧"]);
    expect(tokenize("lit ❤️‍🔥").emoji).toEqual(["❤️‍🔥"]);
    expect(tokenize("go 🇺🇸 team").emoji).toEqual(["🇺🇸"]);
    expect(tokenize("top 3️⃣ picks").emoji).toEqual(["3️⃣"]);
  });

  it("keeps VS16 emoji but drops text-presentation glyphs", () => {
    expect(tokenize("love ❤️ this").emoji).toEqual(["❤️"]);
    expect(tokenize("Brand™ and ©2024").emoji).toEqual([]);
  });

  it("strips URLs", () => {
    const { words } = tokenize("check https://example.com/path now");
    expect(words).toEqual(["check", "now"]);
  });

  it("keeps internal apostrophes", () => {
    const { words } = tokenize("don't stop");
    expect(words).toContain("don't");
    expect(words).toContain("stop");
  });

  it("returns empty arrays for empty text", () => {
    expect(tokenize("")).toEqual({ words: [], emoji: [] });
  });
});
