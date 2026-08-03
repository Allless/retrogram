import { beforeEach, describe, expect, it, vi } from "vitest";

// Browser globals the module touches, stubbed for the node test environment.
const store = new Map<string, string>();
let prefersDark = false;
const mediaListeners: (() => void)[] = [];

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal("matchMedia", () => ({
  get matches() {
    return prefersDark;
  },
  addEventListener: (_: string, cb: () => void) => mediaListeners.push(cb),
  removeEventListener: () => undefined,
}));
vi.stubGlobal("document", { documentElement: { dataset: {} as DOMStringMap } });
vi.stubGlobal("location", { search: "" });

const theme = await import("./theme");
const appliedTheme = () => document.documentElement.dataset.theme;

describe("theme scheme handling", () => {
  beforeEach(() => {
    store.clear();
    prefersDark = false;
    delete document.documentElement.dataset.theme;
  });

  it("follows the browser scheme when nothing is stored", () => {
    theme.initTheme();
    expect(appliedTheme()).toBe("telegram-day");
    expect(store.has("retrogram.scheme")).toBe(false);

    prefersDark = true;
    for (const cb of mediaListeners) cb();
    expect(appliedTheme()).toBe("telegram");
    expect(store.has("retrogram.scheme")).toBe(false);
  });

  it("stores only explicit overrides and applies them over the browser", () => {
    prefersDark = true;
    theme.setSchemePref("light");
    expect(appliedTheme()).toBe("telegram-day");
    expect(store.get("retrogram.scheme")).toBe("light");
  });

  it("clears storage when set back to auto (smart reset)", () => {
    theme.setSchemePref("dark");
    expect(store.get("retrogram.scheme")).toBe("dark");

    theme.setSchemePref("auto");
    expect(store.has("retrogram.scheme")).toBe(false);
    expect(appliedTheme()).toBe("telegram-day"); // browser is light

    prefersDark = true;
    theme.setSchemePref("auto");
    expect(appliedTheme()).toBe("telegram");
  });

  it("reports the browser preference independently of overrides", () => {
    prefersDark = true;
    theme.setSchemePref("light");
    expect(theme.browserPrefersDark()).toBe(true);
    expect(theme.isDarkApplied()).toBe(false);
  });
});
