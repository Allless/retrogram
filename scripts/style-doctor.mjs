// Run the REAL texting-styles compute against a local WhatsApp export.
// Aggregates only; names masked unless --names.
//
//   node scripts/style-doctor.mjs <export.txt> [--self <name>] [--names]
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const selfArg = args.includes("--self")
  ? args[args.indexOf("--self") + 1]
  : null;
const showNames = args.includes("--names");
if (!path) {
  console.error(
    "usage: node scripts/style-doctor.mjs <export.txt> [--self <name>] [--names]",
  );
  process.exit(1);
}

const { parseWhatsappExport } =
  await import("../src/ts/platforms/whatsapp/parse.ts");
const { buildWhatsappDataset } =
  await import("../src/ts/platforms/whatsapp/build.ts");
const { computeTextingStyles } =
  await import("../src/ts/stats/textingStylesCompute.ts");

const mask = (n) =>
  showNames || !n ? n : `${n[0]}${"*".repeat(Math.max(0, n.length - 1))}`;

const chat = parseWhatsappExport(readFileSync(path, "utf8"));
const counts = new Map();
for (const m of chat.messages)
  counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
const self = selfArg ?? [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
console.log("computing as self =", mask(self));

const { dataset } = buildWhatsappDataset(
  [{ fileName: path.split("/").pop(), chat }],
  self,
);
const r = computeTextingStyles(dataset);
const fmtSide = (s) => ({
  messages: s.messages,
  turns: s.turns,
  msgsPerTurn: s.turns ? (s.messages / s.turns).toFixed(2) : "—",
  charsPerMsg: s.messages ? Math.round(s.chars / s.messages) : 0,
  words: s.words,
});
console.log({
  you: fmtSide(r.you),
  them: fmtSide(r.them),
  splitters: r.splitters.map((s) => ({
    title: mask(s.title),
    msgsPerTurn: s.messagesPerTurn.toFixed(2),
    charsPerMsg: Math.round(s.charsPerMessage),
    turns: s.turns,
  })),
  essayists: r.essayists.map((s) => ({
    title: mask(s.title),
    charsPerMsg: Math.round(s.charsPerMessage),
  })),
});
