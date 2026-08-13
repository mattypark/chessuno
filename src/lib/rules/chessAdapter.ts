import { Chess } from "chess.js";
import type { Army } from "./types";

export interface LegalMove {
  from: string;
  to: string;
  san: string;
  promotion?: string;
  captured?: string;
}

export const STARTING_FEN = new Chess().fen();

/**
 * Rewrites a FEN so `army` is to move.
 *
 * chess.js enforces strict alternation, but a card can buy the same player two or
 * three moves in a row, so after each move we hand the turn straight back. The en
 * passant target is cleared deliberately: that right only ever belongs to the
 * opponent's immediate reply, and here the opponent never gets one, so it expires.
 */
export function forceSideToMove(fen: string, army: Army): string {
  const fields = fen.split(" ");
  if (fields.length !== 6) {
    throw new Error(`Malformed FEN: ${fen}`);
  }
  if (fields[1] === army) return fen;

  fields[1] = army;
  fields[3] = "-";
  return fields.join(" ");
}

export function sideToMove(fen: string): Army {
  return fen.split(" ")[1] as Army;
}

export function legalMoves(fen: string): LegalMove[] {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    san: move.san,
    promotion: move.promotion,
    captured: move.captured,
  }));
}

export interface AppliedMove {
  fen: string;
  san: string;
  captured?: string;
}

/**
 * Applies one move and hands the turn straight back to the mover. Returns null if
 * the move is not legal in the given position.
 */
export function applyMove(
  fen: string,
  move: { from: string; to: string; promotion?: string },
): AppliedMove | null {
  const chess = new Chess(fen);
  const played = chess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion ?? "q",
  });
  if (!played) return null;

  return {
    fen: forceSideToMove(chess.fen(), played.color as Army),
    san: played.san,
    captured: played.captured,
  };
}

export interface PositionStatus {
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
  /** Insufficient material, threefold, or the fifty-move rule. */
  drawn: boolean;
}

/** Evaluates the position from the perspective of whoever is to move in `fen`. */
export function positionStatus(fen: string): PositionStatus {
  const chess = new Chess(fen);
  return {
    inCheck: chess.isCheck(),
    checkmate: chess.isCheckmate(),
    stalemate: chess.isStalemate(),
    drawn: chess.isInsufficientMaterial() || chess.isDraw(),
  };
}

/** True when the given army has no legal reply and is in check. */
export function isMated(fen: string, army: Army): boolean {
  return positionStatus(forceSideToMove(fen, army)).checkmate;
}
