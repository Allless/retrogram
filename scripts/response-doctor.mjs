// Run the REAL response-times pipeline (production parser → builder →
// computeResponseTimes) against a local WhatsApp export and print
// aggregate diagnostics. Masks names unless --names; never prints content.
//
//   node scripts/response-doctor.mjs <export.txt> [--self <name>] [--names]
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const selfArg = args.includes("--self")
  ? args[args.indexOf("--self") + 1]
  : null;
const showNames = args.includes("--names");
if (!path) {
  console.error(
    "usage: node scripts/response-doctor.mjs <export.txt> [--self <name>] [--names]",
  );
  process.exit(1);
}

const { parseWhatsappExport } =
  await import("../src/ts/platforms/whatsapp/parse.ts");
const { buildWhatsappDataset } =
  await import("../src/ts/platforms/whatsapp/build.ts");
const { computeResponseTimes } =
  await import("../src/ts/stats/responseTimesCompute.ts");
const { sessionThresholdMs } =
  await import("../src/ts/stats/shared/sessions.ts");

const mask = (n) =>
  showNames || !n ? n : `${n[0]}${"*".repeat(Math.max(0, n.length - 1))}`;

const fileName = path.split("/").pop();
const chat = parseWhatsappExport(readFileSync(path, "utf8"));
if (chat.messages.length === 0) {
  console.error("no messages parsed");
  process.exit(1);
}
const counts = new Map();
for (const m of chat.messages)
  counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
console.log(
  "participants:",
  [...counts.entries()].map(([n, c]) => `${mask(n)} (${c})`).join(" · "),
);

const self = selfArg ?? [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
console.log("computing as self =", mask(self));

const { dataset } = buildWhatsappDataset([{ fileName, chat }], self);

const gaps = [];
for (let i = 1; i < dataset.messages.length; i++)
  gaps.push(dataset.messages[i].timestamp - dataset.messages[i - 1].timestamp);
console.log(
  "session threshold:",
  (sessionThresholdMs(gaps) / 3600000).toFixed(1),
  "h",
);

const r = computeResponseTimes(dataset);
const fmtS = (s) =>
  s === null
    ? "—"
    : s < 60
      ? `${Math.round(s)}s`
      : s < 3600
        ? `${(s / 60).toFixed(1)}m`
        : `${(s / 3600).toFixed(1)}h`;
console.log({
  yourMedian: fmtS(r.yourMedianSeconds),
  theirMedian: fmtS(r.theirMedianSeconds),
  minuteGranularity: r.minuteGranularity,
  initiations: r.initiations,
  perChat: r.perChat.map((c) => ({
    title: mask(c.title),
    you: fmtS(c.yourMedianSeconds),
    them: fmtS(c.theirMedianSeconds),
    replies: c.replies,
  })),
  theyGhost: r.theyGhost.map((g) => ({
    title: mask(g.title),
    ignoredAttempts: g.ignoredAttempts,
    medianReply: fmtS(g.medianReplySeconds),
  })),
  youGhost: r.youGhost.map((g) => ({
    title: mask(g.title),
    ignoredAttempts: g.ignoredAttempts,
    medianReply: fmtS(g.medianReplySeconds),
  })),
});
