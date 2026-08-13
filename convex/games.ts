import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { vCardColor } from "./schema";
import { legalMoves } from "../src/lib/rules/chessAdapter";
import { createGame, opponentOf, playableCardIds, reduce } from "../src/lib/rules/game";
import {
  IllegalActionError,
  type GameAction,
  type GameState,
  type Seat,
} from "../src/lib/rules/types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No look-alikes.
const CODE_LENGTH = 4;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function findByCode(ctx: QueryCtx, code: string) {
  return ctx.db
    .query("games")
    .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
    .unique();
}

/** Convex stores tuples as plain arrays; the rules layer wants them back. */
function asGameState(stored: unknown): GameState {
  return stored as GameState;
}

function seatOf(playerTokens: string[], playerToken: string): Seat | null {
  const index = playerTokens.indexOf(playerToken);
  return index === 0 || index === 1 ? (index as Seat) : null;
}

export const create = mutation({
  args: { playerToken: v.string() },
  handler: async (ctx, { playerToken }) => {
    let code = randomCode();
    // Codes are short enough to collide; walk until we find a free one.
    while (await findByCode(ctx, code)) {
      code = randomCode();
    }

    await ctx.db.insert("games", {
      code,
      playerTokens: [playerToken],
      state: createGame(code),
      updatedAt: Date.now(),
    });

    return { code };
  },
});

export const join = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, { code, playerToken }) => {
    const game = await findByCode(ctx, code);
    if (!game) throw new Error("No game with that code.");

    const existing = seatOf(game.playerTokens, playerToken);
    if (existing !== null) return { seat: existing };

    if (game.playerTokens.length >= 2) {
      throw new Error("That game already has two players.");
    }

    await ctx.db.patch(game._id, {
      playerTokens: [...game.playerTokens, playerToken],
      updatedAt: Date.now(),
    });

    return { seat: 1 as Seat };
  },
});

const vAction = v.union(
  v.object({
    type: v.literal("PLAY_CARD"),
    cardId: v.string(),
    declaredColor: v.optional(vCardColor),
  }),
  v.object({ type: v.literal("DRAW_CARD") }),
  v.object({
    type: v.literal("MAKE_MOVE"),
    from: v.string(),
    to: v.string(),
    promotion: v.optional(v.string()),
  }),
  v.object({ type: v.literal("END_TURN") }),
  v.object({ type: v.literal("RESIGN") }),
);

/**
 * Every rule runs here, on the server, through the same `reduce()` the tests
 * cover. The client sends intent only — it never decides what is legal, and the
 * seat comes from the stored token rather than from the request body.
 */
export const dispatch = mutation({
  args: { code: v.string(), playerToken: v.string(), action: vAction },
  handler: async (ctx, { code, playerToken, action }) => {
    const game = await findByCode(ctx, code);
    if (!game) throw new Error("No game with that code.");

    const seat = seatOf(game.playerTokens, playerToken);
    if (seat === null) throw new Error("You are not seated in this game.");

    if (game.playerTokens.length < 2) {
      throw new Error("Waiting for a second player.");
    }

    try {
      const next = reduce(asGameState(game.state), { ...action, seat } as GameAction);
      await ctx.db.patch(game._id, { state: next, updatedAt: Date.now() });
    } catch (error) {
      if (error instanceof IllegalActionError) {
        // Surfaced to the player as a readable message; the state is left alone.
        throw new Error(error.message);
      }
      throw error;
    }

    return null;
  },
});

/**
 * The player's view of a game. Your own hand comes back in full; your opponent's
 * is a count. Nothing here lets a client read cards it should not see.
 */
export const get = query({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, { code, playerToken }) => {
    const game = await findByCode(ctx, code);
    if (!game) return null;

    const seat = seatOf(game.playerTokens, playerToken);
    const state = asGameState(game.state);
    const isYourTurn = seat !== null && seat === state.turnSeat && state.status === "active";

    return {
      code: game.code,
      seat,
      playerCount: game.playerTokens.length,
      fen: state.fen,
      activeColor: state.activeColor,
      discardTop: state.discard[state.discard.length - 1],
      deckCount: state.deck.length,
      hand: seat === null ? [] : state.hands[seat],
      opponentCardCount: seat === null ? 0 : state.hands[opponentOf(seat)].length,
      yourArmy: seat === null ? null : state.ownership[seat],
      turnSeat: state.turnSeat,
      movesRemaining: state.movesRemaining,
      cardPlayedThisTurn: state.cardPlayedThisTurn,
      drewThisTurn: state.drewThisTurn,
      status: state.status,
      winner: state.winner,
      result: state.result,
      log: state.log,
      // Only ever computed for the player who is actually on the move.
      legalMoves: isYourTurn && state.movesRemaining > 0 ? legalMoves(state.fen) : [],
      // Uno legality plus the chess restrictions, so the UI cannot light a card
      // the server is about to refuse.
      playableCardIds:
        isYourTurn && !state.cardPlayedThisTurn ? playableCardIds(state, seat) : [],
    };
  },
});
