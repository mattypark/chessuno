"use client";

const STORAGE_KEY = "chessuno.playerToken";

/**
 * A per-browser identity. There are no accounts — the token is what maps a
 * browser to a seat, and the server trusts it for nothing beyond that.
 */
export function getPlayerToken(): string {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const token = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, token);
  return token;
}
