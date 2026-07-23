/**
 * Peer avatars: real profile photos with an initials fallback. Photo downloads
 * need a live gramjs client, so the dashboard provides an `AvatarSource`
 * through context and stat cards stay pure — they just render `<Avatar>`.
 * Without a live session (e.g. a dataset restored from cache) the initials
 * fallback renders.
 */

import { createContext } from "preact";
import { useContext, useEffect } from "preact/hooks";

export interface AvatarSource {
  /** Ask for a peer's profile photo; a no-op without a live client. */
  request: (peerId: string) => void;
  /** peerId → object URL, or null when the download failed/unavailable. */
  urls: Record<string, string | null>;
}

export const AvatarContext = createContext<AvatarSource>({
  request: () => undefined,
  urls: {},
});

/** First letters of up to two title words, for the avatar fallback. */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? "");
  return letters.join("").toUpperCase();
}

/** Deterministic hue from the title, so each avatar has a stable color. */
export function avatarHue(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) % 360;
  }
  return hash;
}

export function Avatar({ peerId, title }: { peerId: string; title: string }) {
  const { request, urls } = useContext(AvatarContext);
  useEffect(() => request(peerId), [peerId, request]);

  const url = urls[peerId];
  if (url) {
    return <img class="avatar avatar-img" src={url} alt="" loading="lazy" />;
  }
  return (
    <span
      class="avatar"
      style={{ backgroundColor: `hsl(${avatarHue(title)} 55% 45%)` }}
      aria-hidden="true"
    >
      {initials(title)}
    </span>
  );
}

/**
 * Best-effort Telegram link for a peer: t.me for public usernames, the tg://
 * app protocol for private users. Private groups/channels have no linkable
 * form → null.
 */
export function peerLink(peerId: string, username?: string): string | null {
  if (username) return `https://t.me/${username}`;
  const [kind, id] = peerId.split(":");
  return kind === "user" && id ? `tg://user?id=${id}` : null;
}

interface PeerProps {
  peerId: string;
  title: string;
  username?: string;
}

/** An `Avatar` that opens the chat in Telegram when the peer is linkable. */
export function PeerAvatar({ peerId, title, username }: PeerProps) {
  const link = peerLink(peerId, username);
  const avatar = <Avatar peerId={peerId} title={title} />;
  if (!link) return avatar;
  return (
    <a
      class="avatar-link"
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
      aria-hidden="true"
    >
      {avatar}
    </a>
  );
}

/** A peer's display name, linked to Telegram when the peer is linkable. */
export function PeerName({
  peerId,
  title,
  username,
  class: className,
}: PeerProps & { class: string }) {
  const link = peerLink(peerId, username);
  if (!link) return <span class={className}>{title}</span>;
  return (
    <a class={className} href={link} target="_blank" rel="noopener noreferrer">
      {title}
    </a>
  );
}
