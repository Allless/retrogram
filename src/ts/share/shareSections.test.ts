import { describe, expect, it } from "vitest";

import {
  ALL_SHARE_SECTIONS,
  DEFAULT_SHARE_SECTIONS,
  SHARE_EXTRAS,
  SHARE_SECTIONS,
} from "./summary";

describe("share section defaults", () => {
  it("keeps every section describing other people out of the default", () => {
    const aboutOthers = SHARE_SECTIONS.filter(
      (section) => "aboutOthers" in section,
    ).map((section) => section.key);
    expect(aboutOthers.length).toBeGreaterThan(0);
    for (const key of aboutOthers) {
      expect(DEFAULT_SHARE_SECTIONS).not.toContain(key);
    }
  });

  it("keeps content opt-ins out of the default", () => {
    for (const extra of SHARE_EXTRAS) {
      expect(DEFAULT_SHARE_SECTIONS).not.toContain(extra.key);
    }
  });

  it("defaults to the sections that only describe you", () => {
    expect(DEFAULT_SHARE_SECTIONS).toEqual([
      "headline",
      "volume",
      "heatmap",
      "emoji",
      "streaks",
      "media",
    ]);
  });

  it("share-everything covers all sections and extras", () => {
    for (const section of SHARE_SECTIONS) {
      expect(ALL_SHARE_SECTIONS).toContain(section.key);
    }
    for (const extra of SHARE_EXTRAS) {
      expect(ALL_SHARE_SECTIONS).toContain(extra.key);
    }
  });
});
