/**
 * Hostnames whose embed endpoints require the user's auth session to load
 * (Google Drive content, YouTube/Vimeo private videos, etc.). The
 * `checkUrlCompatibility` cloud function does a server-side HEAD without
 * cookies, so for these providers it follows the auth-redirect chain to a
 * sign-in page and reads `X-Frame-Options: DENY` from THAT page — not from
 * the real embed endpoint. The verdict is meaningless for private content.
 *
 * Treating these hostnames as always-embeddable on the client bypasses the
 * server check AND heals widgets whose config was poisoned with
 * `isEmbeddable: false` by a prior Verify click.
 */
export const TRUSTED_EMBED_HOSTNAMES: ReadonlyArray<string> = [
  'docs.google.com',
  'drive.google.com',
  'vids.google.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
];
