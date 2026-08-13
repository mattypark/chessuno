import { describe, expect, it } from "vitest";
import { legalMoves } from "../chessAdapter";
import { createGame, playableCardIds, reduce } from "../game";
import { moveBudget } from "../cards";
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
  winner: number | null;
  actions: number;
  finalHandSizes: [number, number];
}

/**
 * How a seat chooses, so the two win conditions can be pitted against each other.
 *
 * `board` hunts material: biggest move budget, captures first. `cards` races to
 * empty its hand and avoids captures, since taking a piece costs it a card.
 * `random` is the fuzzing default.
 */
type Policy = "random" | "board" | "cards";

function playGame(seed: number, policies: [Policy, Policy] = ["random", "random"]): Outcome {
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

    const policy = policies[seat];

    if (!state.cardPlayedThisTurn) {
      const ids = playableCardIds(state, seat);
      if (ids.length > 0) {
        const options = state.hands[seat].filter((c) => ids.includes(c.id));
        // The board player wants the most moves it can buy; the others do not care.
        const card =
          policy === "board"
            ? options.reduce((best, c) => (moveBudget(c) > moveBudget(best) ? c : best))
            : pick(options);
        const cardId = card.id;
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
      const captures = moves.filter((m) => m.captured);
      const quiet = moves.filter((m) => !m.captured);

      // Taking a piece draws a card, so the card racer avoids captures for the
      // same reason the board player seeks them.
      const move =
        policy === "board" && captures.length > 0
          ? pick(captures)
          : policy === "cards" && quiet.length > 0
            ? pick(quiet)
            : pick(moves);
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
    winner: state.winner,
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

describe("board hunter versus card racer", () => {
  const GAMES = 120;
  // Built during collection rather than inside the test: 120 full games is well
  // past vitest's per-test timeout, and this is setup, not the assertion.
  const outcomes = Array.from({ length: GAMES }, (_, i) => playGame(i + 1000, ["board", "cards"]));

  it("leaves the board strategy alive against a player racing to empty their hand", () => {
    const boardWins = outcomes.filter((o) => o.winner === 0).length;
    const cardWins = outcomes.filter((o) => o.winner === 1).length;
    const draws = outcomes.filter((o) => o.winner === null).length;

    console.log(
      `\n  board hunter ${boardWins} / card racer ${cardWins} / drawn ${draws} over ${GAMES} games`,
    );
    console.log(
      "  by result:",
      outcomes.reduce<Record<string, number>>((acc, o) => {
        acc[o.result as string] = (acc[o.result as string] ?? 0) + 1;
        return acc;
      }, {}),
    );

    // Neither of these players can search for mate, so this is a floor, not a
    // forecast: it only shows the board strategy is not simply dead.
    expect(boardWins).toBeGreaterThan(0);
  });
});
