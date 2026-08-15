import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vCardColor = v.union(
  v.literal("red"),
  v.literal("yellow"),
  v.literal("green"),
  v.literal("blue"),
);

export const vCard = v.object({
  id: v.string(),
  kind: v.union(
    v.literal("number"),
    v.literal("skip"),
    v.literal("reverse"),
    v.literal("draw2"),
    v.literal("wild"),
    v.literal("wild4"),
  ),
  color: v.union(vCardColor, v.null()),
  value: v.union(v.number(), v.null()),
});

export const vArmy = v.union(v.literal("w"), v.literal("b"));

/**
 * The full game state, stored verbatim as produced by `reduce()` in
 * src/lib/rules. Tuples become plain arrays here — Convex has no tuple validator —
 * and the rules layer casts them back on the way in.
 */
export const vGameState = v.object({
  fen: v.string(),
  deck: v.array(vCard),
  discard: v.array(vCard),
  activeColor: vCardColor,
  hands: v.array(v.array(vCard)),
  ownership: v.array(vArmy),
  turnSeat: v.number(),
  // Optional so games created before this field existed still validate; the
  // query normalises the absence back to null.
  lastMove: v.optional(v.union(v.object({ from: v.string(), to: v.string() }), v.null())),
  movesRemaining: v.number(),
  pendingSkip: v.boolean(),
  cardPlayedThisTurn: v.boolean(),
  drewThisTurn: v.boolean(),
  status: v.union(v.literal("waiting"), v.literal("active"), v.literal("finished")),
  winner: v.union(v.number(), v.null()),
  result: v.union(
    v.literal("checkmate"),
    v.literal("empty-hand"),
    v.literal("resign"),
    v.literal("stalemate"),
    v.literal("draw"),
    v.null(),
  ),
  log: v.array(v.object({ seat: v.union(v.number(), v.null()), text: v.string() })),
  rngSeed: v.number(),
});

export default defineSchema({
  games: defineTable({
    /** Short room code players share. Unique. */
    code: v.string(),
    /** Client-generated player tokens; array index is the seat. */
    playerTokens: v.array(v.string()),
    state: vGameState,
    updatedAt: v.number(),
  }).index("by_code", ["code"]),
});
