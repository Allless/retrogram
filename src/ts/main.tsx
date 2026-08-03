import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";

import { render } from "preact";

import { App } from "./app";

// Themes are CSS-only: stamping the root element activates the overrides in
// style.css. Query param wins over the ThemePicker's stored choice.
const theme =
  new URLSearchParams(location.search).get("theme") ??
  localStorage.getItem("retrogram.theme") ??
  "rewind-amber";
if (theme !== "default") {
  document.documentElement.dataset.theme = theme;
}

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
