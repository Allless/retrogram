import { deflateSync } from "zlib";
import { describe, expect, it } from "vitest";

import {
  ALL_SHARE_SECTIONS,
  buildShare,
  DEFAULT_SHARE_SECTIONS,
  stripHeavy,
} from "./summary";
import { sampleDataset } from "../model/fixture";
import { MAX_SUMMARY_CHARS } from "./telegraph";

/** Practical ceiling for a link people paste into a chat app. */
const INLINE_URL_LIMIT = 8000;

const inlineChars = (json: string) =>
  Math.ceil((deflateSync(Buffer.from(json)).length * 4) / 3);

describe("share payload size", () => {
  it("keeps the inline-URL fallback sendable", () => {
    const { summary } = buildShare(sampleDataset, new Set(ALL_SHARE_SECTIONS));
    const lean = JSON.stringify(stripHeavy(summary));
    expect(inlineChars(lean)).toBeLessThan(INLINE_URL_LIMIT);
  });

  it("reports what each selection costs", () => {
    for (const [label, keys] of [
      ["default", DEFAULT_SHARE_SECTIONS],
      ["everything", ALL_SHARE_SECTIONS],
    ] as const) {
      const { summary } = buildShare(sampleDataset, new Set(keys));
      const json = JSON.stringify(summary);
      const lean = JSON.stringify(stripHeavy(summary));
      console.log(
        `${label}: hosted ${(json.length / 1024).toFixed(1)}kB · inline ${inlineChars(lean)} chars`,
      );
      expect(json.length).toBeGreaterThan(0);
    }
  });
});

describe("thumbnail room", () => {
  it("leaves room for images under the payload ceiling with everything on", () => {
    const { summary } = buildShare(sampleDataset, new Set(ALL_SHARE_SECTIONS));
    const room = MAX_SUMMARY_CHARS - JSON.stringify(summary).length;
    // Structural sections must never eat the whole page: images still need
    // a workable slice, or hosted shares silently lose their previews.
    expect(room).toBeGreaterThan(20_000);
  });
});
