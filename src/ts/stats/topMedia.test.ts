import { describe, expect, it } from "vitest";

import type { Dataset, MediaType, Message } from "../model/types";
import { topMediaByType } from "./topMedia";

let seq = 0;
function media(
  mediaType: MediaType,
  mediaId: string,
  direction: Message["direction"] = "sent",
): Message {
  return {
    id: `c:${seq++}`,
    chatId: "c",
    senderId: direction === "sent" ? "user:1" : "user:2",
    direction,
    timestamp: 0,
    text: "",
    charCount: 0,
    wordCount: 0,
    mediaType,
    mediaId,
    reactionCount: 0,
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

describe("topMediaByType", () => {
  it("counts by document id, filtered to the requested media type", () => {
    const result = topMediaByType(
      datasetOf([
        media("sticker", "s1"),
        media("sticker", "s1"),
        media("sticker", "s2"),
        media("gif", "g1"), // different type, ignored
      ]),
      "sticker",
      10,
    );
    expect(result).toEqual([
      { mediaId: "s1", count: 2 },
      { mediaId: "s2", count: 1 },
    ]);
  });

  it("respects the limit", () => {
    const result = topMediaByType(
      datasetOf([media("gif", "a"), media("gif", "b"), media("gif", "c")]),
      "gif",
      2,
    );
    expect(result.length).toBe(2);
  });

  it("returns empty when there is no matching media", () => {
    expect(topMediaByType(datasetOf([]), "sticker", 10)).toEqual([]);
  });

  it("ignores received media", () => {
    const result = topMediaByType(
      datasetOf([
        media("sticker", "mine"),
        media("sticker", "theirs", "received"),
        media("sticker", "theirs", "received"),
      ]),
      "sticker",
      10,
    );
    expect(result).toEqual([{ mediaId: "mine", count: 1 }]);
  });
});
