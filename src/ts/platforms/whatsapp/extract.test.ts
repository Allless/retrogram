import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extractUploads } from "./extract";

const CHAT_A = "13/02/24, 21:44 - Ada: hey";
const CHAT_B = "13/02/24, 21:45 - Bo: yo";

const txt = (s: string) => strToU8(s);
const file = (name: string, bytes: Uint8Array) => ({ name, bytes });

describe("extractUploads", () => {
  it("accepts plain txt files", () => {
    const { texts, skipped } = extractUploads([
      file("WhatsApp Chat with A.txt", txt(CHAT_A)),
    ]);
    expect(texts).toHaveLength(1);
    expect(texts[0].name).toBe("WhatsApp Chat with A.txt");
    expect(skipped).toEqual([]);
  });

  it("accepts a WhatsApp export zip (txt + media entries)", () => {
    const zip = zipSync({
      "WhatsApp Chat with A.txt": txt(CHAT_A),
      "IMG-1.jpg": strToU8("fakejpg"),
    });
    const { texts, skipped } = extractUploads([file("export.zip", zip)]);
    expect(texts.map((t) => t.name)).toEqual(["WhatsApp Chat with A.txt"]);
    expect(skipped).toEqual([]);
  });

  it("unpacks leaf zips containing exactly one txt", () => {
    const leafA = zipSync({ "WhatsApp Chat with A.txt": txt(CHAT_A) });
    const leafB = zipSync({ "WhatsApp Chat with B.txt": txt(CHAT_B) });
    const bundle = zipSync({ "a.zip": leafA, "b.zip": leafB });
    const { texts, skipped } = extractUploads([file("bundle.zip", bundle)]);
    expect(texts.map((t) => t.name).sort()).toEqual([
      "WhatsApp Chat with A.txt",
      "WhatsApp Chat with B.txt",
    ]);
    expect(skipped).toEqual([]);
  });

  it("rejects leaf zips with more or fewer than one txt", () => {
    const badLeaf = zipSync({
      "a.txt": txt(CHAT_A),
      "b.txt": txt(CHAT_B),
    });
    const bundle = zipSync({ "bad.zip": badLeaf, "ok.txt": txt(CHAT_A) });
    const { texts, skipped } = extractUploads([file("bundle.zip", bundle)]);
    expect(texts.map((t) => t.name)).toEqual(["ok.txt"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain("bad.zip");
  });

  it("reports zips with nothing usable, junk entries, unsupported files", () => {
    const emptyZip = zipSync({ "IMG-1.jpg": strToU8("x") });
    const macJunk = zipSync({
      "__MACOSX/._chat.txt": strToU8("junk"),
      "chat.txt": txt(CHAT_A),
    });
    const { texts, skipped } = extractUploads([
      file("media-only.zip", emptyZip),
      file("mac.zip", macJunk),
      file("notes.pdf", strToU8("pdf")),
    ]);
    expect(texts.map((t) => t.name)).toEqual(["chat.txt"]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toContain("media-only.zip");
    expect(skipped[1]).toContain("notes.pdf");
  });
});
