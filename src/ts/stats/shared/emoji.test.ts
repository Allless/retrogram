import { describe, expect, it } from "vitest";

import { withEmojiPresentation } from "./emoji";

const VS16 = "️";

describe("withEmojiPresentation", () => {
  it("adds the selector to text-default emoji like the heart", () => {
    expect(withEmojiPresentation("❤")).toBe("❤" + VS16);
    expect(withEmojiPresentation("⭐")).toBe("⭐" + VS16);
  });

  it("leaves emoji that already carry the selector alone", () => {
    expect(withEmojiPresentation("❤" + VS16)).toBe("❤" + VS16);
  });

  it("leaves modern emoji alone", () => {
    expect(withEmojiPresentation("😂")).toBe("😂");
    expect(withEmojiPresentation("🎉")).toBe("🎉");
  });

  it("never touches sequences", () => {
    const flag = "🇩🇪";
    const family = "👩‍👩‍👧";
    const thumbsUp = "👍🏽";
    for (const seq of [flag, family, thumbsUp]) {
      expect(withEmojiPresentation(seq)).toBe(seq);
    }
  });
});
