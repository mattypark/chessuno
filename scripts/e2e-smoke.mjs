/**
 * End-to-end drive of chessuno against the live Convex deployment.
 *
 * Plays a full two-seat game through the real mutations, then attacks the
 * mutation directly with forged payloads to confirm the server, not the UI, is
 * what enforces the rules.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Pass the deployment URL in rather than reading .env: `CONVEX_URL=… node scripts/e2e-smoke.mjs`
const URL = process.env.CONVEX_URL;
if (!URL) throw new Error("Set CONVEX_URL to your deployment's client URL.");
const client = new ConvexHttpClient(URL);

const P1 = `e2e-p1-${process.argv[2] ?? "a"}`;
const P2 = `e2e-p2-${process.argv[2] ?? "a"}`;

const seen = new Set();
let reverseSwaps = 0;
let multiMoveTurns = 0;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

async function expectReject(label, fn) {
  try {
    await fn();
    console.log(`  FAIL  ${label} — was accepted`);
    return false;
  } catch (error) {
    console.log(`  ok    ${label} — rejected: ${String(error.message).split("\n")[0].slice(0, 80)}`);
    return true;
  }
}

const { code } = await client.mutation(api.games.create, { playerToken: P1 });
await client.mutation(api.games.join, { code, playerToken: P2 });
console.log(`room ${code}\n`);

let turns = 0;
let lastOwnership = null;

while (turns < 400) {
  const p1View = await client.query(api.games.get, { code, playerToken: P1 });
  if (p1View.status === "finished") {
    console.log(`\nfinished: winner seat ${p1View.winner}, by ${p1View.result}`);
    console.log(p1View.log.slice(-4).map((l) => `  ${l.text}`).join("\n"));
    break;
  }

  const seat = p1View.turnSeat;
  const token = seat === 0 ? P1 : P2;
  const view = seat === 0 ? p1View : await client.query(api.games.get, { code, playerToken: P2 });

  // Sanity: the FEN's side to move must always equal the army of whoever is on turn.
  if (view.fen.split(" ")[1] !== view.yourArmy) {
    throw new Error(`INVARIANT BROKEN: fen=${view.fen} yourArmy=${view.yourArmy}`);
  }
  if (lastOwnership && lastOwnership !== view.yourArmy && seat === 0) reverseSwaps++;
  if (seat === 0) lastOwnership = view.yourArmy;

  if (!view.cardPlayedThisTurn) {
    // The server decides what is playable — Uno legality plus chess restrictions.
    const playable = view.hand.filter((c) => view.playableCardIds.includes(c.id));

    if (playable.length > 0) {
      const card = pick(playable);
      seen.add(card.kind);
      await client.mutation(api.games.dispatch, {
        code,
        playerToken: token,
        action: {
          type: "PLAY_CARD",
          cardId: card.id,
          declaredColor:
            card.kind === "wild" || card.kind === "wild4"
              ? pick(["red", "yellow", "green", "blue"])
              : undefined,
        },
      });
    } else if (!view.drewThisTurn) {
      await client.mutation(api.games.dispatch, { code, playerToken: token, action: { type: "DRAW_CARD" } });
    } else {
      await client.mutation(api.games.dispatch, { code, playerToken: token, action: { type: "END_TURN" } });
      turns++;
    }
    continue;
  }

  const after = await client.query(api.games.get, { code, playerToken: token });
  if (after.status === "finished") continue;

  if (after.movesRemaining > 1) multiMoveTurns++;

  if (after.movesRemaining > 0 && after.legalMoves.length > 0) {
    const move = pick(after.legalMoves);
    await client.mutation(api.games.dispatch, {
      code,
      playerToken: token,
      action: { type: "MAKE_MOVE", from: move.from, to: move.to, promotion: move.promotion },
    });
  } else {
    await client.mutation(api.games.dispatch, { code, playerToken: token, action: { type: "END_TURN" } });
    turns++;
  }
}

console.log(`\ncard kinds exercised: ${[...seen].sort().join(", ")}`);
console.log(`reverse swaps observed: ${reverseSwaps}`);
console.log(`multi-move turns: ${multiMoveTurns}`);

console.log("\nserver authority:");
const live = await client.mutation(api.games.create, { playerToken: P1 });
await client.mutation(api.games.join, { code: live.code, playerToken: P2 });

await expectReject("player 2 acting on player 1's turn", () =>
  client.mutation(api.games.dispatch, {
    code: live.code,
    playerToken: P2,
    action: { type: "DRAW_CARD" },
  }),
);

await expectReject("unseated stranger acting at all", () =>
  client.mutation(api.games.dispatch, {
    code: live.code,
    playerToken: "attacker-token",
    action: { type: "DRAW_CARD" },
  }),
);

await expectReject("moving before a card is played", () =>
  client.mutation(api.games.dispatch, {
    code: live.code,
    playerToken: P1,
    action: { type: "MAKE_MOVE", from: "e2", to: "e4" },
  }),
);

await expectReject("playing a card that is not in hand", () =>
  client.mutation(api.games.dispatch, {
    code: live.code,
    playerToken: P1,
    action: { type: "PLAY_CARD", cardId: "c0" },
  }),
);

const spy = await client.query(api.games.get, { code: live.code, playerToken: "attacker-token" });
console.log(`  ${spy.hand.length === 0 ? "ok   " : "FAIL "} stranger sees no cards (hand length ${spy.hand.length})`);
const p2see = await client.query(api.games.get, { code: live.code, playerToken: P2 });
console.log(`  ${p2see.hand.length === 7 && p2see.opponentCardCount === 7 ? "ok   " : "FAIL "} opponent hand is a count, not cards`);
