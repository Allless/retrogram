import { describe, it, expect } from "vitest";

import { base64UrlEncode, buildLoginLink } from "./loginLink";

describe("base64UrlEncode", () => {
  it("never emits `+`, `/`, or `=`", () => {
    // Bytes chosen to force `+` and `/` in standard base64 (0xFB 0xFF 0xBF → "+/+/").
    const encoded = base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xbf, 0xfb]));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("encodes known bytes to the expected base64url string", () => {
    // "Man" → "TWFu" in both base64 and base64url (no special chars).
    expect(base64UrlEncode(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe("TWFu");
  });

  it("strips padding that standard base64 would add", () => {
    // Single byte 0x00 is "AA==" in standard base64; base64url drops the padding.
    expect(base64UrlEncode(new Uint8Array([0x00]))).toBe("AA");
  });
});

describe("buildLoginLink", () => {
  it("prefixes the tg://login?token= scheme", () => {
    expect(buildLoginLink(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe(
      "tg://login?token=TWFu",
    );
  });

  it("uses a string token verbatim (already encoded)", () => {
    expect(buildLoginLink("already-encoded_token")).toBe(
      "tg://login?token=already-encoded_token",
    );
  });
});
