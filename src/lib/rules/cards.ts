import type { Card, CardColor } from "./types";

export const MAX_MOVE_BUDGET = 3;

/**
 * Move budget for a number card: ceil(N / 3), floored at one so a 0 still buys a
 * move. 0-3 gives one move, 4-6 gives two, 7-9 gives three.
 */
export function numberCardBudget(value: number): number {
  return Math.max(1, Math.ceil(value / 3));
}

/** Every non-number card grants exactly one move. */
export function moveBudget(card: Card): number {
  if (card.kind === "number" && card.value !== null) {
    return numberCardBudget(card.value);
  }
  return 1;
}

/**
 * Uno matching: wilds are always legal, otherwise match the active colour, the
 * number, or the symbol on top of the discard.
 */
export function isLegalPlay(card: Card, top: Card, activeColor: CardColor): boolean {
  if (card.kind === "wild" || card.kind === "wild4") return true;
  if (card.color === activeColor) return true;

  if (card.kind === "number") {
    return top.kind === "number" && card.value === top.value;
  }

  return card.kind === top.kind;
}

export function hasLegalPlay(hand: readonly Card[], top: Card, activeColor: CardColor): boolean {
  return hand.some((card) => isLegalPlay(card, top, activeColor));
}

export function isWild(card: Card): boolean {
  return card.kind === "wild" || card.kind === "wild4";
}

export function describeCard(card: Card): string {
  const color = card.color ? `${card.color} ` : "";
  switch (card.kind) {
    case "number":
      return `${color}${card.value}`;
    case "skip":
      return `${color}Skip`;
    case "reverse":
      return `${color}Reverse`;
    case "draw2":
      return `${color}Draw 2`;
    case "wild":
      return "Wild";
    case "wild4":
      return "Wild Draw 4";
  }
}
