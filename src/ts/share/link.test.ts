import { describe, expect, it } from "vitest";

import {
  buildShareHash,
  deflateText,
  inflateText,
  parseShareHash,
} from "./link";

describe("share hash", () => {
  it("round-trips a telegraph ref", () => {
    const hash = buildShareHash({
      kind: "telegraph",
      path: "Retrogram-shared-report-07-23",
      key: "abc_DEF-123",
    });
    expect(parseShareHash(hash)).toEqual({
      kind: "telegraph",
      path: "Retrogram-shared-report-07-23",
      key: "abc_DEF-123",
    });
  });

  it("round-trips an inline ref", () => {
    const hash = buildShareHash({ kind: "inline", data: "1SGVsbG8" });
    expect(parseShareHash(hash)).toEqual({ kind: "inline", data: "1SGVsbG8" });
  });

  it("rejects non-share hashes", () => {
    expect(parseShareHash("")).toBeNull();
    expect(parseShareHash("#")).toBeNull();
    expect(parseShareHash("#other=1")).toBeNull();
    expect(parseShareHash("#s=missing-key")).toBeNull();
    expect(parseShareHash('#s=path!key"><script>')).toBeNull();
  });
});

describe("deflate/inflate", () => {
  it("round-trips and actually compresses repetitive JSON", async () => {
    const json = JSON.stringify({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        period: `2025-${String(i + 1).padStart(2, "0")}`,
        sent: i * 100,
        received: i * 90,
      })),
    });
    const data = await deflateText(json);
    await expect(inflateText(data)).resolves.toBe(json);
    expect(data.length).toBeLessThan(json.length);
  });
});
