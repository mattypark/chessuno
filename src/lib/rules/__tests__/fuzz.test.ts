import { describe, expect, it } from "vitest";
import { legalMoves } from "../chessAdapter";
import { createGame, playableCardIds, reduce } from "../game";
import { CARD_COLORS } from "../deck";
import type { CardColor, GameState } from "../types";

/**
 * Plays whole games with random-but-legal choices. Two jobs: prove no sequence of
 * legal actions can crash the reducer or break the ownership invariant, and
 * measure how the two win conditions actually compete — which is the thing the
 * design is most likely to get wrong.
 */

const ACTION_LIMIT = 4000;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0;
    return (s >>> 8) / 16777216;
  };
}

interface Outcome {
  result: GameState["result"];
  actions: number;
  finalHandSizes: [number, number];
}

function playGame(seed: number): Outcome {
  const random = rand(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

  let state = createGame(`SIM${seed}`);
  let actions = 0;

  while (state.status === "active" && actions < ACTION_LIMIT) {
    actions++;
    const seat = state.turnSeat;

    // The whole design rests on this: the FEN's side to move is derived from
    // ownership, never stored separately. If Reverse ever desynced them, the
    // board and the turn would disagree and every legality check downstream
    // would be answering about the wrong army.
    expect(state.fen.split(" ")[1]).toBe(state.ownership[seat]);

    if (!state.cardPlayedThisTurn) {
      const ids = playableCardIds(state, seat);
      if (ids.length > 0) {
        const cardId = pick(ids);
        const card = state.hands[seat].find((c) => c.id === cardId)!;
        state = reduce(state, {
          type: "PLAY_CARD",
          seat,
          cardId,
          declaredColor:
            card.kind === "wild" || card.kind === "wild4"
              ? (pick(CARD_COLORS as unknown as CardColor[]) as CardColor)
              : undefined,
        });
      } else if (!state.drewThisTurn) {
        state = reduce(state, { type: "DRAW_CARD", seat });
      } else {
        state = reduce(state, { type: "END_TURN", seat });
      }
      continue;
    }

    const moves = state.movesRemaining > 0 ? legalMoves(state.fen) : [];
    if (moves.length > 0) {
      const move = pick(moves);
      state = reduce(state, {
        type: "MAKE_MOVE",
        seat,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });
    } else {
      state = reduce(state, { type: "END_TURN", seat });
    }
  }

  return {
    result: state.result,
    actions,
    finalHandSizes: [state.hands[0].length, state.hands[1].length],
  };
}

describe("random full games", () => {
  const GAMES = 200;
  const outcomes = Array.from({ length: GAMES }, (_, i) => playGame(i + 1));

  it("never crashes and always reaches a result", () => {
    expect(outcomes.every((o) => o.result !== null)).toBe(true);
    expect(outcomes.every((o) => o.actions < ACTION_LIMIT)).toBe(true);
  });

  it("reaches both win conditions, so neither is dead weight", () => {
    const tally = outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.result as string] = (acc[o.result as string] ?? 0) + 1;
      return acc;
    }, {});

    const actions = outcomes.map((o) => o.actions).sort((a, b) => a - b);
    console.log("\n  outcomes over", GAMES, "random games:", tally);
    console.log(
      "  actions per game — median",
      actions[Math.floor(actions.length / 2)],
      "| p90",
      actions[Math.floor(actions.length * 0.9)],
      "| max",
      actions[actions.length - 1],
    );

    expect(tally["empty-hand"] ?? 0).toBeGreaterThan(0);
    expect(tally["checkmate"] ?? 0).toBeGreaterThan(0);
  });
});
