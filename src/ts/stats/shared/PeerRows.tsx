import { PeerAvatar, PeerName } from "../../media/avatars";

import type { ComponentChildren, JSX } from "preact";

/** The shape every peer-ranked list row needs to render itself. */
export interface PeerRow {
  chatId: string;
  title: string;
  username?: string;
}

/**
 * A headed list of chats with a per-row detail — the shared shape behind the
 * ranking sections on the response-times, initiation, ghosting, and style
 * slides. Renders nothing when there are no rows.
 */
export function PeerRows<T extends PeerRow>({
  heading,
  rows,
  detail,
}: {
  heading: string;
  rows: T[];
  detail: (row: T) => ComponentChildren;
}): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <div class="response-section">
      <h4>{heading}</h4>
      <ul class="response-per-chat">
        {rows.map((row) => (
          <li key={row.chatId}>
            <PeerAvatar
              peerId={row.chatId}
              title={row.title}
              username={row.username}
            />
            <PeerName
              class="chat-title"
              peerId={row.chatId}
              title={row.title}
              username={row.username}
            />
            <span class="chat-detail">{detail(row)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
