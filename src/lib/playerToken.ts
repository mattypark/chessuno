"use client";

const STORAGE_KEY = "chessuno.playerToken";

/**
 * A per-browser identity. There are no accounts — the token is what maps a
 * browser to a seat, and the server trusts it for nothing beyond that.
 *
 * `profile` keeps separate identities in one browser, which is how you take both
 * seats yourself: open the room twice, once with `?as=2`.
 */
export function getPlayerToken(profile = ""): string {
  if (typeof window === "undefined") return "";

  const key = profile ? `${STORAGE_KEY}.${profile}` : STORAGE_KEY;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const token = crypto.randomUUID();
  window.localStorage.setItem(key, token);
  return token;
}
