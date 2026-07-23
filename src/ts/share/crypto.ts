/**
 * Client-side crypto for shared reports: AES-GCM 256 via WebCrypto. A fresh
 * key is generated per share and travels only in the URL fragment — fragments
 * are never sent in HTTP requests, so no server (not Telegraph, not GitHub
 * Pages) ever sees it. Payload layout: 12-byte IV then the GCM ciphertext,
 * base64url-encoded.
 */

const IV_BYTES = 12;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encrypt UTF-8 text; returns the payload and the key, both base64url. */
export async function encryptText(
  plain: string,
): Promise<{ payload: string; key: string }> {
  // 128-bit keys keep the share URL short (22 base64url chars vs 43) and are
  // ample for this threat model.
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(plain),
    ),
  );

  const payload = new Uint8Array(IV_BYTES + ciphertext.length);
  payload.set(iv);
  payload.set(ciphertext, IV_BYTES);

  const rawKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", cryptoKey),
  );
  return { payload: toBase64Url(payload), key: toBase64Url(rawKey) };
}

/** Decrypt a payload produced by `encryptText`. Rejects on a wrong key. */
export async function decryptText(
  payload: string,
  key: string,
): Promise<string> {
  const bytes = fromBase64Url(payload);
  const iv = bytes.slice(0, IV_BYTES);
  const ciphertext = bytes.slice(IV_BYTES);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(key),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}
