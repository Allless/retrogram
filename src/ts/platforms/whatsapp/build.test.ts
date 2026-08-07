import { describe, expect, it } from "vitest";

import { parseWhatsappExport } from "./parse";
import { buildWhatsappDataset } from "./build";

const chatSam = parseWhatsappExport(
  [
    "13/02/24, 21:44 - Ada: hey",
    "13/02/24, 21:45 - Sam: hi!",
    "14/02/24, 09:02 - Sam: <Media omitted>",
  ].join("\n"),
);

const groupChat = parseWhatsappExport(
  [
    "13/02/24, 22:00 - Ada: evening all",
    "13/02/24, 22:01 - Sam: o/",
    "13/02/24, 22:02 - Marta: hey",
  ].join("\n"),
);

describe("buildWhatsappDataset", () => {
  it("builds a dataset with wa-prefixed ids and correct directions", () => {
    const { dataset: ds } = buildWhatsappDataset(
      [{ fileName: "WhatsApp Chat with Sam.txt", chat: chatSam }],
      "Ada",
    );
    expect(ds.self.id).toBe("wa:Ada");
    expect(ds.meta.platform).toBe("whatsapp");
    expect(ds.meta.partial).toBe(true);
    expect(ds.meta.timezone).toBe("UTC");
    expect(Object.keys(ds.chats)).toEqual(["wa:chat:sam"]);
    expect(ds.chats["wa:chat:sam"].type).toBe("private");
    expect(ds.chats["wa:chat:sam"].title).toBe("Sam");
    expect(ds.messages.map((m) => m.direction)).toEqual([
      "sent",
      "received",
      "received",
    ]);
    expect(ds.messages[0].senderId).toBe("wa:Ada");
    expect(ds.contacts["wa:Sam"].isSelf).toBe(false);
  });

  it("merges multiple exports and classifies groups", () => {
    const { dataset: ds } = buildWhatsappDataset(
      [
        { fileName: "WhatsApp Chat with Sam.txt", chat: chatSam },
        { fileName: "WhatsApp Chat with Book Club.txt", chat: groupChat },
      ],
      "Ada",
    );
    expect(Object.keys(ds.chats)).toHaveLength(2);
    expect(ds.chats["wa:chat:book-club"].type).toBe("group");
    expect(ds.meta.messageCount).toBe(6);
    // chronological across chats
    const stamps = ds.messages.map((m) => m.timestamp);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  });

  it("skips an identical chat uploaded twice, silently", () => {
    const { dataset: ds, skippedConflicts } = buildWhatsappDataset(
      [
        { fileName: "WhatsApp Chat with Sam.txt", chat: chatSam },
        { fileName: "WhatsApp Chat with Sam.txt", chat: chatSam },
      ],
      "Ada",
    );
    expect(Object.keys(ds.chats)).toHaveLength(1);
    expect(ds.meta.messageCount).toBe(3);
    expect(skippedConflicts).toEqual([]);
  });

  it("skips a conflicting chat (same identity, different content)", () => {
    const older = parseWhatsappExport("13/02/24, 21:44 - Ada: hey");
    const { dataset: ds, skippedConflicts } = buildWhatsappDataset(
      [
        { fileName: "WhatsApp Chat with Sam.txt", chat: chatSam },
        { fileName: "WhatsApp Chat with Sam (1).txt", chat: older },
      ],
      "Ada",
    );
    expect(Object.keys(ds.chats)).toHaveLength(1);
    expect(ds.meta.messageCount).toBe(3); // first upload wins
    expect(skippedConflicts).toEqual(["WhatsApp Chat with Sam (1).txt"]);
  });

  it("derives fetchedAt and dateRange from the newest message", () => {
    const { dataset: ds } = buildWhatsappDataset(
      [{ fileName: "WhatsApp Chat with Sam.txt", chat: chatSam }],
      "Sam",
    );
    expect(ds.meta.fetchedAt).toBe(Date.UTC(2024, 1, 14, 9, 2));
    expect(ds.meta.dateRange.from).toBe(Date.UTC(2024, 1, 13, 21, 44));
  });
});
