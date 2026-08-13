import { shuffle } from "./rng";
import type { Card, CardColor, GameState, Seat } from "./types";

export const CARD_COLORS: readonly CardColor[] = ["red", "yellow", "green", "blue"];

export const STARTING_HAND_SIZE = 7;

/**
 * Standard 108-card Uno deck: per colour one 0, two each of 1-9, and two each of
 * Skip / Reverse / Draw 2 (25 x 4 = 100), plus 4 Wild and 4 Wild Draw 4.
 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let n = 0;
  const push = (card: Omit<Card, "id">) => {
    cards.push({ ...card, id: `c${n++}` });
  };

  for (const color of CARD_COLORS) {
    push({ kind: "number", color, value: 0 });
    for (let value = 1; value <= 9; value++) {
      push({ kind: "number", color, value });
      push({ kind: "number", color, value });
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      push({ kind, color, value: null });
      push({ kind, color, value: null });
    }
  }

  for (let i = 0; i < 4; i++) {
    push({ kind: "wild", color: null, value: null });
    push({ kind: "wild4", color: null, value: null });
  }

  return cards;
}

/**
 * Refills an exhausted draw pile from the discard, keeping the top card in play.
 * Wilds go back in colourless so they can be re-declared. No-op if there is
 * nothing to recycle.
 */
export function reshuffleIfNeeded(state: GameState): GameState {
  if (state.deck.length > 0 || state.discard.length <= 1) return state;

  const top = state.discard[state.discard.length - 1];
  const recycled = state.discard
    .slice(0, -1)
    .map((card) =>
      card.kind === "wild" || card.kind === "wild4" ? { ...card, color: null } : card,
    );

  const { value: deck, seed } = shuffle(recycled, state.rngSeed);

  return {
    ...state,
    deck,
    discard: [top],
    rngSeed: seed,
    log: [...state.log, { seat: null, text: "Draw pile reshuffled." }],
  };
}

/** Draws `count` cards into a seat's hand, reshuffling as required. */
export function drawCards(state: GameState, seat: Seat, count: number): GameState {
  let next = state;

  for (let i = 0; i < count; i++) {
    next = reshuffleIfNeeded(next);
    if (next.deck.length === 0) break; // Both piles dry — nothing left to draw.

    const [card, ...rest] = next.deck;
    const hands: GameState["hands"] = [next.hands[0], next.hands[1]];
    hands[seat] = [...hands[seat], card];
    next = { ...next, deck: rest, hands };
  }

  return next;
}
