import { STARTING_FEN } from "../chessAdapter";
import type { Card, CardColor, CardKind, GameState } from "../types";

let idCursor = 0;

/** Builds a single card with a unique id, for hand-crafted test hands. */
export function card(kind: CardKind, color: CardColor | null, value: number | null = null): Card {
  return { id: `t${idCursor++}`, kind, color, value };
}

export function num(color: CardColor, value: number): Card {
  return card("number", color, value);
}

/**
 * A fully controlled game state. Every scenario test sets exactly the fields it
 * cares about rather than dealing a random game and hoping.
 */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    fen: STARTING_FEN,
    deck: [num("red", 1), num("red", 2), num("red", 3), num("red", 4)],
    discard: [num("red", 5)],
    activeColor: "red",
    hands: [
      [num("red", 1), num("blue", 2)],
      [num("red", 3), num("green", 4)],
    ],
    ownership: ["w", "b"],
    turnSeat: 0,
    movesRemaining: 0,
    pendingSkip: false,
    cardPlayedThisTurn: false,
    drewThisTurn: false,
    status: "active",
    winner: null,
    result: null,
    log: [],
    rngSeed: 12345,
  };

  return { ...base, ...overrides };
}
