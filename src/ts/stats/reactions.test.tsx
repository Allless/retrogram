import render from "preact-render-to-string";
import { describe, expect, it } from "vitest";

import { reactions } from "./reactions";
import type { Dataset, Message } from "../model/types";

const VS16 = "️";

function reacted(emoticon: string, you: boolean): Message {
  return {
    id: "c:1",
    chatId: "c",
    senderId: "user:1",
    direction: "sent",
    timestamp: 0,
    text: "",
    charCount: 0,
    wordCount: 0,
    mediaType: "text",
    reactionCount: 1,
    reactions: [{ emoticon, count: 1, you }],
  };
}

function datasetOf(messages: Message[]): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: {},
    messages,
    meta: {
      fetchedAt: 0,
      messageCount: messages.length,
      dateRange: { from: 0, to: 0 },
      timezone: "UTC",
      partial: false,
    },
  };
}

describe("reactions card", () => {
  /*
   * Telegram sends reaction emoticons bare — "❤" is U+2764 with no
   * presentation selector, which renders as a black text glyph. The card is
   * responsible for asking for the colour form; asserting on the rendered
   * markup is what catches the wiring being dropped, which a unit test of
   * withEmojiPresentation alone would not.
   */
  it("renders a bare heart reaction in emoji presentation", () => {
    const dataset = datasetOf([reacted("❤", true), reacted("❤", false)]);
    const html = render(<reactions.Card result={reactions.compute(dataset)} />);

    expect(html).toContain(`❤${VS16}`);
    expect(html).not.toMatch(/❤(?!️)/u);
  });

  it("leaves emoji that already render in colour untouched", () => {
    const dataset = datasetOf([reacted("😂", true)]);
    const html = render(<reactions.Card result={reactions.compute(dataset)} />);

    expect(html).toContain("😂");
    expect(html).not.toContain(VS16);
  });
});
