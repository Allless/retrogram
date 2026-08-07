import type { Dataset, PeerId } from "../../model/types";

/** One-sided by nature: Telegram service notifications, the Replies bot,
 * and the Verification Codes chat. */
const SERVICE_PEERS = new Set([
  "user:777000",
  "user:1271266957",
  "user:489000",
]);

/** Chats with no real human on the other side — yourself (Saved Messages),
 * service notification streams, bots. These pollute any two-sided metric. */
export function isNoiseChat(dataset: Dataset, chatId: PeerId): boolean {
  const chat = dataset.chats[chatId];
  return (
    chatId === dataset.self.id ||
    SERVICE_PEERS.has(chatId) ||
    chat?.isBot === true ||
    // Telegram requires bot usernames to end in "bot", which catches bots in
    // datasets cached before `isBot` was captured.
    (chat?.type === "private" &&
      chat.username !== undefined &&
      /bot$/i.test(chat.username))
  );
}
