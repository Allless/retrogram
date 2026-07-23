/**
 * Top DMs and Top groups — the same ranking, split by chat type. Groups and
 * channels only contain your own messages (ingestion filters to "me" there),
 * so the group card ranks and reports what *you* posted, while the DM card
 * shows both directions.
 */

import type { Chat, Dataset } from "../model/types";
import { PeerAvatar, PeerName } from "../media/avatars";
import { defineStat } from "./registry";

export interface TopChat {
  chatId: string;
  title: string;
  username?: string;
  messages: number;
  words: number;
  sent: number;
  received: number;
}

export interface TopContactsResult {
  chats: TopChat[];
}

const MAX_CHATS = 10;

function computeTop(
  dataset: Dataset,
  includeType: (type: Chat["type"] | undefined) => boolean,
  rank: (chat: TopChat) => number,
): TopContactsResult {
  const byChat = new Map<string, TopChat>();

  for (const message of dataset.messages) {
    if (!includeType(dataset.chats[message.chatId]?.type)) continue;

    const existing =
      byChat.get(message.chatId) ??
      ({
        chatId: message.chatId,
        title: dataset.chats[message.chatId]?.title ?? message.chatId,
        username: dataset.chats[message.chatId]?.username,
        messages: 0,
        words: 0,
        sent: 0,
        received: 0,
      } satisfies TopChat);

    existing.messages += 1;
    existing.words += message.wordCount;
    if (message.direction === "sent") {
      existing.sent += 1;
    } else {
      existing.received += 1;
    }

    byChat.set(message.chatId, existing);
  }

  const chats = [...byChat.values()]
    .filter((chat) => rank(chat) > 0)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, MAX_CHATS);

  return { chats };
}

function RankList({
  chats,
  detail,
  emptyLabel,
}: {
  chats: TopChat[];
  detail: (chat: TopChat) => string;
  emptyLabel: string;
}) {
  if (chats.length === 0) {
    return <p class="muted">{emptyLabel}</p>;
  }

  return (
    <ol class="rank-list">
      {chats.map((chat, index) => (
        <li class="rank-row" key={chat.chatId}>
          <span class="rank-index">{index + 1}</span>
          <PeerAvatar
            peerId={chat.chatId}
            title={chat.title}
            username={chat.username}
          />
          <span class="rank-body">
            <PeerName
              class="rank-title"
              peerId={chat.chatId}
              title={chat.title}
              username={chat.username}
            />
            <span class="rank-split muted">{detail(chat)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export const topDms = defineStat<TopContactsResult>({
  id: "top-dms",
  title: "Top DMs",
  description: "The people you exchange the most messages with.",
  compute: (dataset) =>
    computeTop(
      dataset,
      (type) => type === undefined || type === "private",
      (chat) => chat.messages,
    ),
  Card: ({ result }) => (
    <RankList
      chats={result.chats}
      detail={(chat) =>
        `${chat.messages} msgs · ${chat.sent} sent · ${chat.received} received`
      }
      emptyLabel="No direct chats yet."
    />
  ),
});

export const topGroups = defineStat<TopContactsResult>({
  id: "top-groups",
  title: "Top groups",
  description: "The groups and channels where you post the most.",
  compute: (dataset) =>
    computeTop(
      dataset,
      (type) => type === "group" || type === "channel",
      (chat) => chat.sent,
    ),
  Card: ({ result }) => (
    <RankList
      chats={result.chats}
      detail={(chat) => `${chat.sent} msgs from you`}
      emptyLabel="No group activity yet."
    />
  ),
});
