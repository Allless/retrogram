import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";

import { render } from "preact";

import { App } from "./app";

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
