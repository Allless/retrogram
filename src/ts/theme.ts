/**
 * The app ships the Telegram day/night theme pair, following the browser
 * scheme unless the user overrides it. `?theme=` forces any theme from
 * style.css (kept as an evaluation escape hatch).
 */
export type SchemePref = "auto" | "light" | "dark";

const KEY = "retrogram.scheme";

// Lazy so importing this module is safe in non-browser contexts (tests).
let mediaQuery: MediaQueryList | null = null;
function media(): MediaQueryList {
  mediaQuery ??= matchMedia("(prefers-color-scheme: dark)");
  return mediaQuery;
}

export function getSchemePref(): SchemePref {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
}

export function setSchemePref(pref: SchemePref): void {
  if (pref === "auto") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  apply();
}

function apply(): void {
  const pref = getSchemePref();
  const dark = pref === "auto" ? media().matches : pref === "dark";
  document.documentElement.dataset.theme = dark ? "telegram" : "telegram-day";
}

export function initTheme(): void {
  localStorage.removeItem("retrogram.theme"); // stale key from the old picker
  const forced = new URLSearchParams(location.search).get("theme");
  if (forced) {
    if (forced !== "default") document.documentElement.dataset.theme = forced;
    return;
  }
  apply();
  media().addEventListener("change", apply);
}
