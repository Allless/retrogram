import { describe, expect, it } from "vitest";

import { decryptText, encryptText, fromBase64Url, toBase64Url } from "./crypto";

describe("base64url", () => {
  it("round-trips arbitrary bytes without padding chars", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });
});

describe("encryptText / decryptText", () => {
  it("round-trips text", async () => {
    const { payload, key } = await encryptText('{"hello":"мир 👋"}');
    expect(payload).not.toContain("hello");
    await expect(decryptText(payload, key)).resolves.toBe('{"hello":"мир 👋"}');
  });

  it("produces a different payload and key per share", async () => {
    const a = await encryptText("same text");
    const b = await encryptText("same text");
    expect(a.payload).not.toBe(b.payload);
    expect(a.key).not.toBe(b.key);
  });

  it("rejects on a wrong key", async () => {
    const { payload } = await encryptText("secret");
    const { key: otherKey } = await encryptText("other");
    await expect(decryptText(payload, otherKey)).rejects.toThrow();
  });
});
