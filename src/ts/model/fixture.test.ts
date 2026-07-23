import { describe, expect, it } from "vitest";

import { sampleDataset } from "./fixture";

describe("sampleDataset", () => {
  it("is chronologically ordered", () => {
    const { messages } = sampleDataset;
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].timestamp).toBeGreaterThanOrEqual(
        messages[i - 1].timestamp,
      );
    }
  });

  it("has consistent meta", () => {
    const { messages, meta } = sampleDataset;
    expect(meta.messageCount).toBe(messages.length);
    expect(meta.dateRange.from).toBe(messages[0].timestamp);
    expect(meta.dateRange.to).toBe(messages[messages.length - 1].timestamp);
    expect(meta.partial).toBe(false);
  });

  it("every message references a known chat and sender", () => {
    const { messages, chats, contacts } = sampleDataset;
    for (const m of messages) {
      expect(chats[m.chatId]).toBeDefined();
      expect(contacts[m.senderId]).toBeDefined();
    }
  });

  it("sent messages come from self, received do not", () => {
    for (const m of sampleDataset.messages) {
      if (m.direction === "sent") {
        expect(m.senderId).toBe(sampleDataset.self.id);
      } else {
        expect(m.senderId).not.toBe(sampleDataset.self.id);
      }
    }
  });

  it("covers the intended edge cases", () => {
    const { messages } = sampleDataset;
    const byChat = (id: string) => messages.filter((m) => m.chatId === id);

    // Receive-only bot: no sent messages.
    expect(byChat("user:103").every((m) => m.direction === "received")).toBe(
      true,
    );
    // Media-heavy chat: majority non-text.
    const jordan = byChat("user:102");
    expect(jordan.filter((m) => m.mediaType !== "text").length).toBeGreaterThan(
      jordan.length / 2,
    );
    // Ghosted chat has messages, but none in the final quarter of the range.
    const sam = byChat("user:101");
    expect(sam.length).toBeGreaterThan(0);
    const { from, to } = sampleDataset.meta.dateRange;
    const lastQuarterStart = from + (to - from) * 0.75;
    expect(sam.every((m) => m.timestamp < lastQuarterStart)).toBe(true);
    // Reply chains exist.
    expect(messages.some((m) => m.replyToId !== undefined)).toBe(true);
  });
});
