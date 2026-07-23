/**
 * Telegram QR login encodes exactly a `tg://login?token=<base64url>` URL into the
 * QR image. The token rotates every ~30s while the login screen is open.
 *
 * Because the QR is nothing more than that URL, the scannable QR code and the
 * "Open in Telegram" deep-link button are two presentations of the *same* rotating
 * token: render the string as a QR for another device to scan, or hand it to the
 * local Telegram app via an `<a href>`. This module owns that shared presentation
 * and stays dependency-free (no gramjs) so it is trivially testable.
 */

/** Encode raw bytes as unpadded base64url (`+`→`-`, `/`→`_`, no `=`). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build the `tg://login?token=...` deep link shared by the QR code and the
 * "Open in Telegram" button.
 *
 * A `Uint8Array` is treated as the raw token and base64url-encoded; a `string` is
 * treated as an already-encoded token and used verbatim.
 */
export function buildLoginLink(token: Uint8Array | string): string {
  const encoded = typeof token === "string" ? token : base64UrlEncode(token);
  return `tg://login?token=${encoded}`;
}
