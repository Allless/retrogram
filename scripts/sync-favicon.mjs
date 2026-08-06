// Generate src/public/favicon.svg from the logo source of truth.
// The app imports src/logo.svg (decorative, aria-hidden); the
// favicon copy is a standalone document served at a stable unhashed URL
// (also used by the og:image/twitter:image metas), so it gets img semantics.
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/logo.svg"), "utf8");
const favicon = source.replace(
  'aria-hidden="true"',
  'role="img" aria-label="Rewindly"',
);
if (favicon === source) {
  throw new Error("logo.svg: expected aria-hidden root attribute");
}
mkdirSync(join(root, "src/public"), { recursive: true });
writeFileSync(join(root, "src/public/favicon.svg"), favicon);
console.log("favicon.svg synced from logo.svg");
