import { describe, expect, it } from "vitest";

import {
  mapMediaType,
  mediaKindOf,
  normalizeMessage,
  normalizePeerToChat,
  normalizePeerToContact,
  type RawMessage,
  type RawPeer,
} from "./normalize";

function rawMessage(overrides: Partial<RawMessage> = {}): RawMessage {
  return {
    chatId: "user:100",
    messageId: 42,
    senderId: "user:100",
    fromSelf: false,
    date: 1_700_000_000,
    ...overrides,
  };
}

describe("mapMediaType", () => {
  it("maps known kinds", () => {
    expect(mapMediaType("MessageMediaPhoto")).toBe("photo");
    expect(mapMediaType("sticker")).toBe("sticker");
    expect(mapMediaType("animation")).toBe("gif");
  });

  it("returns 'text' for undefined and 'other' for unknown", () => {
    expect(mapMediaType(undefined)).toBe("text");
    expect(mapMediaType("MessageMediaContact")).toBe("other");
  });
});

describe("mediaKindOf", () => {
  function mediaDocument(...attributes: Record<string, unknown>[]) {
    return {
      className: "MessageMediaDocument",
      document: { id: "1", attributes },
    };
  }

  it("returns undefined for missing media and the className for non-documents", () => {
    expect(mediaKindOf(undefined)).toBeUndefined();
    expect(mediaKindOf(null)).toBeUndefined();
    expect(mediaKindOf({ className: "MessageMediaPhoto" })).toBe(
      "MessageMediaPhoto",
    );
  });

  it("detects stickers and gifs from document attributes", () => {
    expect(
      mediaKindOf(mediaDocument({ className: "DocumentAttributeSticker" })),
    ).toBe("sticker");
    expect(
      mediaKindOf(
        mediaDocument(
          { className: "DocumentAttributeVideo" },
          { className: "DocumentAttributeAnimated" },
        ),
      ),
    ).toBe("gif");
  });

  it("distinguishes voice notes, audio, and video", () => {
    expect(
      mediaKindOf(
        mediaDocument({ className: "DocumentAttributeAudio", voice: true }),
      ),
    ).toBe("voice");
    expect(
      mediaKindOf(mediaDocument({ className: "DocumentAttributeAudio" })),
    ).toBe("audio");
    expect(
      mediaKindOf(mediaDocument({ className: "DocumentAttributeVideo" })),
    ).toBe("video");
  });

  it("falls back to document for attribute-less documents", () => {
    expect(mediaKindOf(mediaDocument())).toBe("document");
    expect(mediaKindOf({ className: "MessageMediaDocument" })).toBe("document");
  });

  it("round-trips through mapMediaType to the right MediaType", () => {
    const sticker = mediaKindOf(
      mediaDocument({ className: "DocumentAttributeSticker" }),
    );
    expect(mapMediaType(sticker)).toBe("sticker");
  });
});

describe("normalizeMessage", () => {
  it("builds a globally unique id from chat and message id", () => {
    expect(normalizeMessage(rawMessage()).id).toBe("user:100:42");
  });

  it("converts epoch seconds to milliseconds", () => {
    expect(
      normalizeMessage(rawMessage({ date: 1_700_000_000 })).timestamp,
    ).toBe(1_700_000_000_000);
  });

  it("derives direction from fromSelf", () => {
    expect(normalizeMessage(rawMessage({ fromSelf: true })).direction).toBe(
      "sent",
    );
    expect(normalizeMessage(rawMessage({ fromSelf: false })).direction).toBe(
      "received",
    );
  });

  it("counts chars and words, and treats empty text as zero", () => {
    const withText = normalizeMessage(
      rawMessage({ text: "hello there world" }),
    );
    expect(withText.charCount).toBe(17);
    expect(withText.wordCount).toBe(3);

    const empty = normalizeMessage(rawMessage({ text: undefined }));
    expect(empty.text).toBe("");
    expect(empty.charCount).toBe(0);
    expect(empty.wordCount).toBe(0);
  });

  it("maps media and builds reply id only when present", () => {
    const media = normalizeMessage(
      rawMessage({ media: "MessageMediaPhoto", replyToMessageId: 7 }),
    );
    expect(media.mediaType).toBe("photo");
    expect(media.replyToId).toBe("user:100:7");

    expect(normalizeMessage(rawMessage()).replyToId).toBeUndefined();
  });

  it("converts editDate to ms only when present", () => {
    expect(
      normalizeMessage(rawMessage({ editDate: 1_700_000_500 })).editTimestamp,
    ).toBe(1_700_000_500_000);
    expect(normalizeMessage(rawMessage()).editTimestamp).toBeUndefined();
  });
});

describe("peer normalizers", () => {
  const peer: RawPeer = {
    id: "chat:200",
    kind: "group",
    title: "Weekend Trip",
    memberCount: 4,
  };

  it("maps peer kind to chat type", () => {
    expect(normalizePeerToChat({ ...peer, kind: "user" }).type).toBe("private");
    expect(normalizePeerToChat({ ...peer, kind: "group" }).type).toBe("group");
    expect(normalizePeerToChat({ ...peer, kind: "channel" }).type).toBe(
      "channel",
    );
  });

  it("carries memberCount only when present", () => {
    expect(normalizePeerToChat(peer).memberCount).toBe(4);
    const noCount = normalizePeerToChat({ ...peer, memberCount: undefined });
    expect(noCount.memberCount).toBeUndefined();
  });

  it("builds a contact, defaulting isSelf to false", () => {
    const contact = normalizePeerToContact({
      id: "user:1",
      kind: "user",
      title: "Me",
      username: "me",
      isSelf: true,
    });
    expect(contact).toEqual({
      id: "user:1",
      displayName: "Me",
      username: "me",
      isSelf: true,
    });
    expect(normalizePeerToContact(peer).isSelf).toBe(false);
  });
});
