import { describe, expect, it } from "vitest";
import { legalMoves } from "../chessAdapter";
import { opponentOf, playableCardIds, reduce } from "../game";
import { IllegalActionError, type GameState } from "../types";
import { card, makeState, num } from "./helpers";

/** White rooks on a1/b1 mate the h8 king in two consecutive moves: Rb7 then Ra8#. */
const LADDER_FEN = "7k/8/8/8/8/8/8/RR5K w - - 0 1";
/** Black is mated the moment it is black's turn; white is fine and to move. */
const BLACK_LOST_FEN = "R6k/R7/8/8/8/8/8/7K w - - 0 1";
/** White's king is in check from the h4 queen. */
const WHITE_IN_CHECK_FEN = "4k3/8/8/8/7q/8/8/4K3 w - - 0 1";

function playFirstCard(state: GameState, extra?: { declaredColor?: "red" }): GameState {
  return reduce(state, {
    type: "PLAY_CARD",
    seat: state.turnSeat,
    cardId: state.hands[state.turnSeat][0].id,
    ...extra,
  });
}

describe("turn structure", () => {
  it("grants moves equal to the card's budget", () => {
    const state = makeState({ hands: [[num("red", 8), num("blue", 1)], [num("red", 3)]] });
    expect(playFirstCard(state).movesRemaining).toBe(3);
  });

  it("refuses a second card in the same turn", () => {
    const played = playFirstCard(
      makeState({ hands: [[num("red", 4), num("red", 2)], [num("red", 3)]] }),
    );
    expect(() => playFirstCard(played)).toThrow(IllegalActionError);
  });

  it("refuses a card that matches nothing", () => {
    const state = makeState({ hands: [[num("blue", 7)], [num("red", 3)]] });
    expect(() => playFirstCard(state)).toThrow(/does not match/);
  });

  it("refuses moves before a card is played", () => {
    const state = makeState({ fen: LADDER_FEN });
    expect(() =>
      reduce(state, { type: "MAKE_MOVE", seat: 0, from: "b1", to: "b7" }),
    ).toThrow(/Play a card/);
  });

  it("refuses actions from the seat that is not to move", () => {
    const state = makeState();
    expect(() =>
      reduce(state, { type: "PLAY_CARD", seat: 1, cardId: state.hands[1][0].id }),
    ).toThrow(/not your turn/);
  });

  it("passes the turn once the move budget is spent", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[num("red", 1), num("blue", 9)], [num("red", 3)]],
    });
    const played = playFirstCard(state);
    expect(played.movesRemaining).toBe(1);

    const moved = reduce(played, { type: "MAKE_MOVE", seat: 0, from: "b1", to: "b7" });
    expect(moved.turnSeat).toBe(1);
    expect(moved.movesRemaining).toBe(0);
    expect(moved.fen.split(" ")[1]).toBe("b");
  });

  it("lets a player end a multi-move turn early", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[num("red", 9), num("blue", 1)], [num("red", 3)]],
    });
    const played = playFirstCard(state);
    expect(played.movesRemaining).toBe(3);
    expect(reduce(played, { type: "END_TURN", seat: 0 }).turnSeat).toBe(1);
  });
});

describe("drawing", () => {
  it("refuses a draw while a playable card is held", () => {
    const state = makeState({ hands: [[num("red", 1)], [num("red", 3)]] });
    expect(() => reduce(state, { type: "DRAW_CARD", seat: 0 })).toThrow(/playable card/);
  });

  it("allows a draw when nothing matches, and lets the turn end with no moves", () => {
    const state = makeState({
      hands: [[num("blue", 7)], [num("red", 3)]],
      deck: [num("blue", 9)],
    });
    const drawn = reduce(state, { type: "DRAW_CARD", seat: 0 });
    expect(drawn.hands[0]).toHaveLength(2);

    const ended = reduce(drawn, { type: "END_TURN", seat: 0 });
    expect(ended.turnSeat).toBe(1);
    // Board untouched — no card, no moves — only the side to move follows the seat.
    expect(ended.fen.split(" ")[0]).toBe(state.fen.split(" ")[0]);
    expect(ended.fen.split(" ")[1]).toBe("b");
  });

  it("lets the drawn card be played when it happens to match", () => {
    const state = makeState({
      hands: [[num("blue", 7)], [num("red", 3)]],
      deck: [num("red", 9)],
    });
    const drawn = reduce(state, { type: "DRAW_CARD", seat: 0 });
    const played = reduce(drawn, { type: "PLAY_CARD", seat: 0, cardId: drawn.hands[0][1].id });
    expect(played.cardPlayedThisTurn).toBe(true);
  });
});

describe("card effects", () => {
  it("Skip costs the opponent their whole turn", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[card("skip", "red"), num("blue", 1)], [num("red", 3)]],
    });
    const played = playFirstCard(state);
    expect(played.pendingSkip).toBe(true);
    expect(played.movesRemaining).toBe(1);

    const ended = reduce(played, { type: "END_TURN", seat: 0 });
    expect(ended.turnSeat).toBe(0);
    expect(ended.pendingSkip).toBe(false);
  });

  it("Draw 2 and Wild Draw 4 grow the opponent's hand", () => {
    const base = makeState({
      deck: [num("blue", 1), num("blue", 2), num("blue", 3), num("blue", 4)],
    });

    const withDraw2 = {
      ...base,
      hands: [[card("draw2", "red"), num("blue", 1)], [num("red", 3)]],
    } as GameState;
    const two = reduce(withDraw2, {
      type: "PLAY_CARD",
      seat: 0,
      cardId: withDraw2.hands[0][0].id,
    });
    expect(two.hands[1]).toHaveLength(3);

    const withWild4 = {
      ...base,
      hands: [[card("wild4", null), num("blue", 1)], [num("red", 3)]],
    } as GameState;
    const four = reduce(withWild4, {
      type: "PLAY_CARD",
      seat: 0,
      cardId: withWild4.hands[0][0].id,
      declaredColor: "green",
    });
    expect(four.hands[1]).toHaveLength(5);
    expect(four.activeColor).toBe("green");
  });

  it("requires a declared colour for a wild", () => {
    const state = makeState({ hands: [[card("wild", null), num("red", 1)], [num("red", 3)]] });
    expect(() => playFirstCard(state)).toThrow(/Declare a colour/);
  });
});

describe("Reverse", () => {
  it("swaps army ownership and hands the mover the other army", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[card("reverse", "red"), num("blue", 1)], [num("red", 3)]],
    });
    const played = playFirstCard(state);

    expect(played.ownership).toEqual(["b", "w"]);
    expect(played.fen.split(" ")[1]).toBe("b");
    expect(played.movesRemaining).toBe(1);
    // Hands belong to players, never to armies.
    expect(played.hands[1]).toHaveLength(1);
  });

  it("leaves the board itself untouched", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[card("reverse", "red"), num("blue", 1)], [num("red", 3)]],
    });
    const played = playFirstCard(state);
    expect(played.fen.split(" ")[0]).toBe(LADDER_FEN.split(" ")[0]);
  });

  it("loses on the spot when you take over a mated army", () => {
    const state = makeState({
      fen: BLACK_LOST_FEN,
      hands: [[card("reverse", "red"), num("blue", 1)], [num("red", 3)]],
    });
    const played = playFirstCard(state);

    expect(played.status).toBe("finished");
    expect(played.winner).toBe(1);
    expect(played.result).toBe("checkmate");
  });

  it("does not deadlock a turn when every matching card is a blocked Reverse", () => {
    // Reverse matches the discard but is refused in check. If the draw rule only
    // looked at Uno legality, this player could neither play nor draw.
    const state = makeState({
      fen: WHITE_IN_CHECK_FEN,
      hands: [[card("reverse", "red"), card("reverse", "blue")], [num("red", 3)]],
      discard: [card("reverse", "red")],
      deck: [num("red", 6)],
    });

    expect(playableCardIds(state, 0)).toEqual([]);

    const drawn = reduce(state, { type: "DRAW_CARD", seat: 0 });
    expect(drawn.hands[0]).toHaveLength(3);
    expect(playableCardIds(drawn, 0)).toEqual([drawn.hands[0][2].id]);
  });

  it("reports a Reverse as unplayable while in check, not merely refuses it", () => {
    const playable = makeState({
      fen: LADDER_FEN,
      hands: [[card("reverse", "red")], [num("red", 3)]],
    });
    expect(playableCardIds(playable, 0)).toHaveLength(1);
  });

  it("cannot be used to dodge check", () => {
    const state = makeState({
      fen: WHITE_IN_CHECK_FEN,
      hands: [[card("reverse", "red"), num("blue", 1)], [num("red", 3)]],
    });
    expect(() => playFirstCard(state)).toThrow(/king is in check/);
  });

  it("keeps armies alternating across a swap", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[card("reverse", "red"), num("blue", 1)], [num("red", 3), num("blue", 5)]],
    });
    const played = playFirstCard(state);
    const moved = reduce(played, { type: "MAKE_MOVE", seat: 0, from: "h8", to: "g8" });

    expect(moved.turnSeat).toBe(1);
    expect(moved.ownership[1]).toBe("w");
    expect(moved.fen.split(" ")[1]).toBe("w");
  });
});

describe("captures cost cards", () => {
  /** White rook a1, black rook a8: Rxa8 is a capture and gives no check. */
  const CAPTURE_FEN = "r5k1/8/8/8/8/8/8/R6K w - - 0 1";

  it("draws a card when you take a piece", () => {
    const state = makeState({
      fen: CAPTURE_FEN,
      hands: [[num("red", 1), num("blue", 3)], [num("red", 3)]],
      deck: [num("green", 5), num("green", 6)],
    });
    const played = reduce(state, { type: "PLAY_CARD", seat: 0, cardId: state.hands[0][0].id });
    const captured = reduce(played, { type: "MAKE_MOVE", seat: 0, from: "a1", to: "a8" });

    expect(captured.hands[0]).toHaveLength(2);
    expect(captured.log.some((entry) => entry.text.includes("captures and draws"))).toBe(true);
  });

  it("draws nothing for a quiet move", () => {
    const state = makeState({
      fen: CAPTURE_FEN,
      hands: [[num("red", 1), num("blue", 3)], [num("red", 3)]],
      deck: [num("green", 5)],
    });
    const played = reduce(state, { type: "PLAY_CARD", seat: 0, cardId: state.hands[0][0].id });
    const quiet = reduce(played, { type: "MAKE_MOVE", seat: 0, from: "a1", to: "a4" });

    expect(quiet.hands[0]).toHaveLength(1);
  });
});

describe("answering check", () => {
  /** White to move. Ra1-a8 checks the e8 king, which can still run to the 7th. */
  const CHECK_IN_ONE_FEN = "4k3/8/8/8/8/8/8/R6K w - - 0 1";

  /** Plays seat 0's first card, then the checking rook move. */
  function deliverCheck(state: GameState, declaredColor?: "green"): GameState {
    const played = reduce(state, {
      type: "PLAY_CARD",
      seat: 0,
      cardId: state.hands[0][0].id,
      declaredColor,
    });
    return reduce(played, { type: "MAKE_MOVE", seat: 0, from: "a1", to: "a8" });
  }

  it("refuses to let you end your turn while your own king is in check", () => {
    const state = makeState({
      fen: WHITE_IN_CHECK_FEN,
      hands: [[num("red", 1), num("blue", 2)], [num("red", 3)]],
      cardPlayedThisTurn: true,
      movesRemaining: 1,
    });
    expect(() => reduce(state, { type: "END_TURN", seat: 0 })).toThrow(/answer the check/);
  });

  it("draws the checked player into a playable card when they hold nothing", () => {
    // Seat 1 is checked holding a card that matches nothing. Left alone, their
    // turn would pass without a move and the king would simply be taken.
    const state = makeState({
      fen: CHECK_IN_ONE_FEN,
      hands: [[card("wild", null), num("red", 1)], [num("blue", 2)]],
      discard: [num("blue", 7)],
      deck: [num("green", 9)],
    });

    const checked = deliverCheck(state, "green");
    expect(checked.status).toBe("active");
    expect(checked.turnSeat).toBe(1);
    expect(checked.hands[1]).toHaveLength(2);
    expect(playableCardIds(checked, 1)).toHaveLength(1);
  });

  it("is checkmate when no card can be found to answer the check", () => {
    // Wild declares green, so neither seat 1's blue 2 nor the recycled blue 7
    // can be played, and the piles run dry.
    const state = makeState({
      fen: CHECK_IN_ONE_FEN,
      hands: [[card("wild", null), num("red", 1)], [num("blue", 2)]],
      discard: [num("blue", 7)],
      deck: [],
    });

    const checked = deliverCheck(state, "green");
    expect(checked.status).toBe("finished");
    expect(checked.winner).toBe(0);
    expect(checked.result).toBe("checkmate");
  });

  it("lets check override a pending Skip", () => {
    // Otherwise the checker skips the player they just checked and comes back to
    // a board where the enemy king is hanging.
    const state = makeState({
      fen: CHECK_IN_ONE_FEN,
      hands: [[card("skip", "green"), num("red", 1)], [num("green", 2)]],
      discard: [card("skip", "blue")],
      deck: [],
    });

    const checked = deliverCheck(state);
    expect(checked.turnSeat).toBe(1);
    expect(checked.pendingSkip).toBe(false);
    expect(checked.log.some((entry) => entry.text.includes("cannot be skipped"))).toBe(true);
  });
});

describe("winning", () => {
  it("wins immediately on playing your last card, before any move", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[num("red", 7)], [num("red", 3)]],
    });
    const played = playFirstCard(state);

    expect(played.status).toBe("finished");
    expect(played.winner).toBe(0);
    expect(played.result).toBe("empty-hand");
    expect(played.fen).toBe(LADDER_FEN); // No moves were ever spent.
  });

  it("wins by delivering mate on the second move of one turn", () => {
    const state = makeState({
      fen: LADDER_FEN,
      hands: [[num("red", 4), num("blue", 1)], [num("red", 3)]],
    });
    const played = playFirstCard(state);
    expect(played.movesRemaining).toBe(2);

    const first = reduce(played, { type: "MAKE_MOVE", seat: 0, from: "b1", to: "b7" });
    expect(first.status).toBe("active");

    const second = reduce(first, { type: "MAKE_MOVE", seat: 0, from: "a1", to: "a8" });
    expect(second.status).toBe("finished");
    expect(second.winner).toBe(0);
    expect(second.result).toBe("checkmate");
  });

  it("forfeits the rest of the budget the moment a move gives check", () => {
    // Rb7 is quiet, Ra8 is check. With three moves banked, the turn still has to
    // stop the instant check appears — otherwise the next move takes the king.
    const state = makeState({
      fen: "6k1/8/8/8/8/8/8/RR5K w - - 0 1",
      hands: [[num("red", 9), num("blue", 1)], [num("red", 3), num("blue", 4)]],
    });
    const played = playFirstCard(state);
    expect(played.movesRemaining).toBe(3);

    const checking = reduce(played, { type: "MAKE_MOVE", seat: 0, from: "a1", to: "a8" });
    expect(checking.status).toBe("active");
    expect(checking.turnSeat).toBe(1);
    expect(checking.movesRemaining).toBe(0);
    expect(checking.log.some((entry) => entry.text.includes("Check"))).toBe(true);
  });

  it("never offers a king capture, because the checked side always moves next", () => {
    const state = makeState({
      fen: "6k1/8/8/8/8/8/8/RR5K w - - 0 1",
      hands: [[num("red", 9), num("blue", 1)], [num("red", 3), num("blue", 4)]],
    });
    const checking = reduce(playFirstCard(state), {
      type: "MAKE_MOVE",
      seat: 0,
      from: "a1",
      to: "a8",
    });

    // It is black's turn and black is in check, so no white move exists to take
    // the king — the position the old bug relied on cannot be reached.
    expect(checking.fen.split(" ")[1]).toBe("b");
    expect(legalMoves(checking.fen).every((move) => move.captured !== "k")).toBe(true);
  });

  it("ends the game when the turn passes to a player who is already mated", () => {
    const state = makeState({
      fen: BLACK_LOST_FEN,
      hands: [[num("red", 1), num("blue", 2)], [num("red", 3)]],
      cardPlayedThisTurn: true,
    });
    const ended = reduce(state, { type: "END_TURN", seat: 0 });

    expect(ended.status).toBe("finished");
    expect(ended.winner).toBe(0);
    expect(ended.result).toBe("checkmate");
  });

  it("hands the win to the other seat on resignation, from either turn", () => {
    const state = makeState();
    expect(reduce(state, { type: "RESIGN", seat: 1 }).winner).toBe(0);
    expect(reduce(state, { type: "RESIGN", seat: 0 }).winner).toBe(1);
  });

  it("refuses every action once the game is finished", () => {
    const finished = makeState({ status: "finished", winner: 0, result: "resign" });
    expect(() => reduce(finished, { type: "DRAW_CARD", seat: 0 })).toThrow(/game is over/i);
  });
});

describe("opponentOf", () => {
  it("flips seats", () => {
    expect(opponentOf(0)).toBe(1);
    expect(opponentOf(1)).toBe(0);
  });
});
