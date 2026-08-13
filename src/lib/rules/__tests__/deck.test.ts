import { describe, expect, it } from "vitest";
import { buildDeck, drawCards, reshuffleIfNeeded } from "../deck";
import { createGame } from "../game";
import { makeState, num } from "./helpers";

describe("deck composition", () => {
  const deck = buildDeck();

  it("has 108 cards", () => {
    expect(deck).toHaveLength(108);
  });

  it("has one 0 and two of each 1-9 per colour", () => {
    const red = deck.filter((c) => c.color === "red" && c.kind === "number");
    expect(red.filter((c) => c.value === 0)).toHaveLength(1);
    expect(red.filter((c) => c.value === 7)).toHaveLength(2);
    expect(red).toHaveLength(19);
  });

  it("has 8 of each action card and 4 of each wild", () => {
    expect(deck.filter((c) => c.kind === "skip")).toHaveLength(8);
    expect(deck.filter((c) => c.kind === "reverse")).toHaveLength(8);
    expect(deck.filter((c) => c.kind === "draw2")).toHaveLength(8);
    expect(deck.filter((c) => c.kind === "wild")).toHaveLength(4);
    expect(deck.filter((c) => c.kind === "wild4")).toHaveLength(4);
  });

  it("gives every card a unique id", () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });
});

describe("drawing and reshuffling", () => {
  it("moves cards from the top of the deck into a hand", () => {
    const state = makeState();
    const next = drawCards(state, 0, 2);
    expect(next.hands[0]).toHaveLength(4);
    expect(next.deck).toHaveLength(2);
    expect(next.hands[0].slice(2)).toEqual(state.deck.slice(0, 2));
  });

  it("recycles the discard when the deck runs dry, keeping the top card", () => {
    const top = num("blue", 8);
    const state = makeState({
      deck: [],
      discard: [num("red", 1), num("red", 2), num("green", 3), top],
    });

    const next = reshuffleIfNeeded(state);
    expect(next.discard).toEqual([top]);
    expect(next.deck).toHaveLength(3);
    expect(next.deck.map((c) => c.id).sort()).toEqual(
      state.discard.slice(0, -1).map((c) => c.id).sort(),
    );
  });

  it("strips declared colours off recycled wilds", () => {
    const state = makeState({
      deck: [],
      discard: [{ id: "w1", kind: "wild", color: "green", value: null }, num("blue", 8)],
    });
    expect(reshuffleIfNeeded(state).deck[0].color).toBeNull();
  });

  it("stops drawing rather than throwing when both piles are empty", () => {
    const state = makeState({ deck: [], discard: [num("blue", 8)] });
    expect(drawCards(state, 0, 3).hands[0]).toHaveLength(2);
  });
});

describe("createGame", () => {
  const game = createGame("ROOM1");

  it("deals seven cards each and opens on a number card", () => {
    expect(game.hands[0]).toHaveLength(7);
    expect(game.hands[1]).toHaveLength(7);
    expect(game.discard).toHaveLength(1);
    expect(game.discard[0].kind).toBe("number");
    expect(game.activeColor).toBe(game.discard[0].color);
  });

  it("leaves the rest of the deck intact", () => {
    expect(game.deck).toHaveLength(108 - 1 - 14);
  });

  it("starts player 1 on white with no moves banked", () => {
    expect(game.ownership).toEqual(["w", "b"]);
    expect(game.turnSeat).toBe(0);
    expect(game.movesRemaining).toBe(0);
    expect(game.fen.split(" ")[1]).toBe("w");
  });

  it("deals the same game for the same room code", () => {
    expect(createGame("ROOM1").hands).toEqual(game.hands);
    expect(createGame("ROOM2").hands).not.toEqual(game.hands);
  });
});
