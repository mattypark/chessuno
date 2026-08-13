/**
 * Core types for chessuno.
 *
 * A player occupies a *seat*. A seat owns an *army* (white or black), and Reverse
 * swaps which seat owns which. The FEN's side-to-move is always derived from
 * `ownership[turnSeat]` — never the other way around.
 */

export type CardColor = "red" | "yellow" | "green" | "blue";

export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface Card {
  id: string;
  kind: CardKind;
  /** null for wilds, which take their colour from the player's declaration. */
  color: CardColor | null;
  /** 0-9 for number cards, null otherwise. */
  value: number | null;
}

export type Seat = 0 | 1;

/** Chess army, matching chess.js colour codes. */
export type Army = "w" | "b";

export type GameStatus = "waiting" | "active" | "finished";

export type GameResult =
  | "checkmate"
  | "empty-hand"
  | "resign"
  | "stalemate"
  | "draw";

export interface LogEntry {
  seat: Seat | null;
  text: string;
}

export interface GameState {
  fen: string;
  /** Face-down draw pile. Index 0 is the next card drawn. */
  deck: Card[];
  /** Discard pile, last element is the top card. */
  discard: Card[];
  /** The colour a card must match. Wilds reset this to the declared colour. */
  activeColor: CardColor;
  hands: [Card[], Card[]];
  /** seat -> army. Reverse swaps these two entries. */
  ownership: [Army, Army];
  turnSeat: Seat;
  movesRemaining: number;
  /** The next seat to receive a turn loses it. Set by Skip. */
  pendingSkip: boolean;
  cardPlayedThisTurn: boolean;
  drewThisTurn: boolean;
  status: GameStatus;
  winner: Seat | null;
  result: GameResult | null;
  log: LogEntry[];
  /** Seeded RNG cursor, kept in state so shuffles are deterministic and replayable. */
  rngSeed: number;
}

export type GameAction =
  | { type: "PLAY_CARD"; seat: Seat; cardId: string; declaredColor?: CardColor }
  | { type: "DRAW_CARD"; seat: Seat }
  | { type: "MAKE_MOVE"; seat: Seat; from: string; to: string; promotion?: string }
  | { type: "END_TURN"; seat: Seat }
  | { type: "RESIGN"; seat: Seat };

/** Thrown for any action the rules forbid. Never fail silently. */
export class IllegalActionError extends Error {
  constructor(
    public readonly reason: string,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "IllegalActionError";
  }
}
