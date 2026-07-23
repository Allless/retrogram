/**
 * Anonymous ciphertext hosting on Telegram's Telegraph (telegra.ph). Account
 * creation is anonymous — no Telegram identity involved, just a bearer token
 * minted on the spot. The token is kept in this browser's localStorage only,
 * so this device can later overwrite ("revoke") the page. Pages hold base64url
 * ciphertext — useless without the key, which never leaves the URL fragment.
 */

const API = "https://api.telegra.ph";
const SHARES_STORAGE_KEY = "retrogram.shares";

export interface TelegraphShare {
  path: string;
  accessToken: string;
}

interface TelegraphResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

async function call(
  method: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  // Form-encoded on purpose: it's a CORS "simple request", so the browser
  // skips the OPTIONS preflight — which telegra.ph answers with 501.
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  const body = (await response.json()) as TelegraphResponse;
  if (!body.ok || typeof body.result !== "object" || body.result === null) {
    throw new Error(body.error ?? `telegra.ph ${method} failed`);
  }
  return body.result as Record<string, unknown>;
}

/** Telegraph rejects pages over 64KB; refuse early so the caller falls back. */
const MAX_PAYLOAD_CHARS = 60_000;

/** Upload a share payload; returns the page path and its edit token. */
export async function uploadShare(payload: string): Promise<TelegraphShare> {
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error("share payload exceeds Telegraph's page size limit");
  }
  const account = await call("createAccount", { short_name: "retrogram" });
  const accessToken = account.access_token;
  if (typeof accessToken !== "string") {
    throw new Error("telegra.ph returned no access token");
  }

  const page = await call("createPage", {
    access_token: accessToken,
    // Single-letter title → short page path → short share URL.
    title: "r",
    author_name: "Retrogram",
    content: JSON.stringify([{ tag: "p", children: [payload] }]),
  });
  const path = page.path;
  if (typeof path !== "string") {
    throw new Error("telegra.ph returned no page path");
  }
  return { path, accessToken };
}

/** Collect all text under Telegraph content nodes. */
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node !== null && "children" in node) {
    return textOf((node as { children: unknown }).children);
  }
  return "";
}

/** Fetch a share payload back from its page path. */
export async function fetchShare(path: string): Promise<string> {
  const page = await call(`getPage/${encodeURIComponent(path)}`, {
    return_content: "true",
  });
  const payload = textOf(page.content).trim();
  if (!payload) {
    throw new Error("This share is empty or was revoked.");
  }
  return payload;
}

/**
 * Remember a created share (path → edit token) so this device could revoke
 * it later by overwriting the page.
 */
export function rememberShare(share: TelegraphShare): void {
  try {
    const raw = localStorage.getItem(SHARES_STORAGE_KEY);
    const shares = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    shares[share.path] = share.accessToken;
    localStorage.setItem(SHARES_STORAGE_KEY, JSON.stringify(shares));
  } catch {
    // Best effort — sharing still works without revocation bookkeeping.
  }
}
