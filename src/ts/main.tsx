import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";

import { render } from "preact";

import { App } from "./app";
import { initTheme } from "./theme";

initTheme();

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
