/** Pure board helpers shared by the board component. No chess.js needed here. */

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

export interface Piece {
  /** Lowercase piece letter: p n b r q k. */
  type: string;
  color: "w" | "b";
}

export type BoardMap = Record<string, Piece>;

/** Parses the placement field of a FEN into a square -> piece map. */
export function parseFen(fen: string): BoardMap {
  const board: BoardMap = {};
  const rows = fen.split(" ")[0].split("/");

  rows.forEach((row, rowIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        fileIndex += Number(char);
        continue;
      }
      const square = `${FILES[fileIndex]}${RANKS[rowIndex]}`;
      board[square] = {
        type: char.toLowerCase(),
        color: char === char.toUpperCase() ? "w" : "b",
      };
      fileIndex += 1;
    }
  });

  return board;
}

/**
 * Solid glyphs for both armies, coloured by fill rather than by character.
 *
 * The hollow outline set (♔♕♖…) is the obvious choice for white and the wrong
 * one: on a light square a cream outline glyph is cream on cream and simply
 * disappears. Filled shapes read at every size on either colour of square.
 */
const GLYPHS: Record<string, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

export function glyphFor(piece: Piece): string {
  return GLYPHS[piece.type] ?? "";
}

/** Squares in render order, from the given army's point of view. */
export function squaresFor(orientation: "w" | "b"): string[] {
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

export function isLightSquare(square: string): boolean {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

/** True when this move needs a promotion piece attached. */
export function isPromotion(piece: Piece | undefined, to: string): boolean {
  if (!piece || piece.type !== "p") return false;
  return piece.color === "w" ? to.endsWith("8") : to.endsWith("1");
}
