import { describe, expect, it } from "vitest";
import { hasLegalPlay, isLegalPlay, moveBudget, numberCardBudget } from "../cards";
import { card, num } from "./helpers";

describe("move budget", () => {
  it("maps 0-9 to ceil(N/3) with a floor of one move", () => {
    const budgets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(numberCardBudget);
    expect(budgets).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it("never exceeds three moves", () => {
    expect(Math.max(...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(numberCardBudget))).toBe(3);
  });

  it("gives every action card exactly one move", () => {
    expect(moveBudget(card("skip", "red"))).toBe(1);
    expect(moveBudget(card("reverse", "red"))).toBe(1);
    expect(moveBudget(card("draw2", "red"))).toBe(1);
    expect(moveBudget(card("wild", null))).toBe(1);
    expect(moveBudget(card("wild4", null))).toBe(1);
  });
});

describe("card legality", () => {
  const top = num("red", 5);

  it("matches on colour", () => {
    expect(isLegalPlay(num("red", 9), top, "red")).toBe(true);
  });

  it("matches on number across colours", () => {
    expect(isLegalPlay(num("blue", 5), top, "red")).toBe(true);
  });

  it("matches on symbol across colours", () => {
    const skipTop = card("skip", "green");
    expect(isLegalPlay(card("skip", "yellow"), skipTop, "green")).toBe(true);
  });

  it("rejects a mismatch on colour, number, and symbol", () => {
    expect(isLegalPlay(num("blue", 7), top, "red")).toBe(false);
    expect(isLegalPlay(card("draw2", "blue"), top, "red")).toBe(false);
  });

  it("always allows wilds", () => {
    expect(isLegalPlay(card("wild", null), top, "red")).toBe(true);
    expect(isLegalPlay(card("wild4", null), top, "red")).toBe(true);
  });

  it("follows the declared colour after a wild, not the wild card itself", () => {
    const wildTop = card("wild", "green");
    expect(isLegalPlay(num("green", 2), wildTop, "green")).toBe(true);
    expect(isLegalPlay(num("red", 2), wildTop, "green")).toBe(false);
  });

  it("detects whether a hand holds any playable card", () => {
    expect(hasLegalPlay([num("blue", 7), card("draw2", "blue")], top, "red")).toBe(false);
    expect(hasLegalPlay([num("blue", 7), num("blue", 5)], top, "red")).toBe(true);
  });
});
